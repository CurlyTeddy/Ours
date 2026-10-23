"use client";

import { useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useDebouncedCallback } from "use-debounce";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Note, NotePlace } from "@/features/moments/models/responses";
import { fieldLabel } from "@/features/moments/components/song-field";

const firstNonBlank = (...values: (string | null | undefined)[]) =>
  values.map((value) => value?.trim() ?? "").find(Boolean) ?? "";

// Places already on notes, one per Google place, plus the draft's own.
function placeChoices(notes: Note[], current: NotePlace | null) {
  const byId = new Map<string, NotePlace>();
  for (const note of notes) {
    if (note.place && !byId.has(note.place.placeId)) {
      byId.set(note.place.placeId, note.place);
    }
  }
  if (current && !byId.has(current.placeId)) {
    byId.set(current.placeId, current);
  }
  return [...byId.values()];
}

function PlaceField({
  place,
  notes,
  onChange,
}: {
  place: NotePlace | null;
  notes: Note[];
  onChange: (place: NotePlace | null) => void;
}) {
  const places = useMapsLibrary("places");
  const [query, setQuery] = useState("");
  // null until a search for the current query has answered
  const [predictions, setPredictions] = useState<
    google.maps.places.PlacePrediction[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  // One token per search session; Google bills the searches plus the final fetchFields as one session.
  const sessionToken =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Answers can arrive out of order; only the newest query may set the list.
  const latestQuery = useRef("");

  const search = useDebouncedCallback(async (input: string) => {
    latestQuery.current = input;
    if (!places || !input) {
      setPredictions(null);
      return;
    }
    try {
      sessionToken.current ??= new places.AutocompleteSessionToken();
      const { suggestions } =
        await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionToken.current,
        });
      if (input !== latestQuery.current) return;
      setError(null);
      setPredictions(
        suggestions.flatMap((suggestion) =>
          suggestion.placePrediction ? [suggestion.placePrediction] : [],
        ),
      );
    } catch (reason) {
      console.error(reason);
      if (input !== latestQuery.current) return;
      setPredictions(null);
      setError("Place search failed. Try again.");
    }
  }, 300);

  const pickPrediction = async (
    prediction: google.maps.places.PlacePrediction,
  ) => {
    search.cancel();
    latestQuery.current = "";
    try {
      const found = prediction.toPlace();
      // Essentials fields only; displayName would bill as Place Details Pro.
      await found.fetchFields({
        fields: ["id", "formattedAddress", "location"],
      });
      sessionToken.current = null;
      if (!found.location) {
        setError("Could not read that location.");
        return;
      }
      onChange({
        name: firstNonBlank(
          prediction.mainText?.text,
          prediction.text.text,
        ).slice(0, 100),
        address: firstNonBlank(
          found.formattedAddress,
          prediction.text.text,
        ).slice(0, 300),
        placeId: found.id,
        latitude: found.location.lat(),
        longitude: found.location.lng(),
      });
      setQuery("");
      setPredictions(null);
      setError(null);
    } catch (reason) {
      console.error(reason);
      setError("Could not read that location.");
    }
  };

  const chips = [
    { key: "none", label: "None", value: null },
    ...placeChoices(notes, place).map((choice) => ({
      key: choice.placeId,
      label: choice.name,
      value: choice,
    })),
  ];
  const trimmedQuery = query.trim();

  return (
    <div className="flex flex-col gap-2.5 max-[900px]:gap-2">
      <span className={fieldLabel}>Place · pins it on the map</span>
      {/* On phones the row scrolls, so it pads the chips' hit areas instead of clipping them. */}
      <div className="flex flex-wrap gap-2 max-[900px]:-my-0.75 max-[900px]:flex-nowrap max-[900px]:overflow-x-auto max-[900px]:overscroll-x-contain max-[900px]:py-0.75">
        {chips.map(({ key, label, value }) => {
          const pressed = (place?.placeId ?? null) === (value?.placeId ?? null);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(value)}
              className={cn(
                "relative inline-flex h-9 flex-none cursor-pointer items-center rounded-full px-3.5 text-[13px] font-extrabold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] max-[900px]:h-9.5 max-[900px]:after:-inset-y-0.75",
                pressed
                  ? "bg-us-seg text-us-seg-ink shadow-[0_4px_10px_-6px_rgba(31,43,66,.6)]"
                  : "bg-us-subtle text-us-ink hover:bg-us-hover",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor="note-place-search">
        Search a place
      </label>
      <div className="flex h-11 items-center gap-2 rounded-[14px] bg-us-surface px-3.5 text-us-muted shadow-[inset_0_0_0_1px_var(--us-field-line)] focus-within:shadow-[inset_0_0_0_2px_#4F70A8]">
        <MapPin size={17} strokeWidth={2.2} aria-hidden="true" />
        <input
          id="note-place-search"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          disabled={!places}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPredictions(null);
            setError(null);
            void search(event.target.value.trim());
          }}
          placeholder={
            places ? "Search a place…" : "Place search is not available."
          }
          className="min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-us-ink outline-none disabled:cursor-not-allowed min-[901px]:text-sm"
        />
      </div>

      {trimmedQuery && predictions ? (
        <div className="-mt-1 flex flex-col gap-0.5">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              onClick={() => void pickPrediction(prediction)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1 text-left hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
            >
              <span className="text-sm font-extrabold text-us-ink">
                {prediction.mainText?.text ?? prediction.text.text}
              </span>
              <span className="truncate text-xs font-bold text-us-muted">
                {prediction.secondaryText?.text}
              </span>
            </button>
          ))}
          {predictions.length === 0 ? (
            <span className="px-2.5 py-2 text-xs font-bold text-us-muted">
              Nothing found for “{trimmedQuery}”
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs font-bold text-us-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export { PlaceField };
