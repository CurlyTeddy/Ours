"use client";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TodoLocation } from "@/features/two-dos/models/location";
import { cn } from "@/lib/utils";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Loader2, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

interface LocationComboboxProps {
  // null means no location yet
  value: TodoLocation | null;
  onChange: (location: TodoLocation | null) => void;
  disabled?: boolean;
}

function LocationCombobox({
  value,
  onChange,
  disabled = false,
}: LocationComboboxProps) {
  const savedName = value?.name ?? "";
  const [inputValue, setInputValue] = useState(savedName);
  const [predictions, setPredictions] = useState<
    google.maps.places.PlacePrediction[]
  >([]);
  const places = useMapsLibrary("places");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  // One token per search session; Google bills the searches plus the final fetchFields as one session.
  const sessionToken =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Answers can arrive out of order; only the newest query may set the list.
  const latestQuery = useRef("");

  useEffect(() => {
    setInputValue(savedName);
  }, [savedName]);

  const searchLocations = useDebouncedCallback((query: string) => {
    const trimmedQuery = query.trim();
    latestQuery.current = trimmedQuery;
    if (trimmedQuery.length < 2) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    if (!places) {
      setLoadError("Location search is not available.");
      return;
    }

    startTransition(async () => {
      try {
        sessionToken.current ??= new places.AutocompleteSessionToken();
        const { suggestions } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmedQuery,
            sessionToken: sessionToken.current,
          });
        if (trimmedQuery !== latestQuery.current) {
          return;
        }
        const nextPredictions = suggestions.flatMap((suggestion) =>
          suggestion.placePrediction ? [suggestion.placePrediction] : [],
        );
        setPredictions(nextPredictions);
        setIsOpen(nextPredictions.length > 0);
        setLoadError(null);
      } catch (error) {
        console.error(error);
        setLoadError("Location search failed.");
        setPredictions([]);
        setIsOpen(false);
      }
    });
  }, 250);

  const selectPrediction = (prediction: google.maps.places.PlacePrediction) => {
    // Drop the scheduled search and any answer in flight so the list stays closed.
    searchLocations.cancel();
    latestQuery.current = "";
    startTransition(async () => {
      try {
        const place = prediction.toPlace();
        // Essentials fields only; displayName would bill as Place Details Pro.
        await place.fetchFields({
          fields: ["id", "formattedAddress", "location"],
        });
        sessionToken.current = null;
        if (!place.location) {
          setLoadError("Could not read that location.");
          return;
        }

        const name = prediction.mainText?.text ?? prediction.text.text;
        onChange({
          name,
          address: place.formattedAddress ?? prediction.text.text,
          placeId: place.id,
          latitude: place.location.lat(),
          longitude: place.location.lng(),
        });
        setInputValue(name);
        setPredictions([]);
        setIsOpen(false);
        setLoadError(null);
      } catch (error) {
        console.error(error);
        setLoadError("Could not read that location.");
      }
    });
  };

  return (
    <FormItem>
      <FormLabel>Location</FormLabel>
      <div className="relative">
        <FormControl>
          <Input
            value={inputValue}
            disabled={disabled}
            placeholder="Search a place..."
            autoComplete="off"
            onChange={(event) => {
              const nextValue = event.target.value;
              setInputValue(nextValue);
              searchLocations(nextValue);
            }}
            onFocus={() => {
              if (predictions.length > 0) {
                setIsOpen(true);
              }
            }}
            onBlur={() => {
              searchLocations.cancel();
              latestQuery.current = "";
              // Typed text that was never picked is not saved, so show the saved place again.
              window.setTimeout(() => {
                setIsOpen(false);
                setInputValue(savedName);
              }, 150);
            }}
            className={value ? "pr-18" : "pr-9"}
          />
        </FormControl>
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear location"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              searchLocations.cancel();
              latestQuery.current = "";
              setPredictions([]);
              setIsOpen(false);
              onChange(null);
            }}
            className="absolute top-1/2 right-7 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#4F70A8]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {isPending ? (
          <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        )}

        {isOpen && predictions.length > 0 && (
          <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {predictions.map((prediction) => (
              <Button
                key={prediction.placeId}
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-3 rounded-sm px-3 py-2 text-left",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPrediction(prediction)}
              >
                <MapPin className="size-4 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {prediction.mainText?.text ?? prediction.text.text}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {prediction.secondaryText?.text ?? prediction.text.text}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>
      {value ? (
        <p className="text-sm text-muted-foreground">{value.address}</p>
      ) : null}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      <FormMessage />
    </FormItem>
  );
}

export { LocationCombobox };
