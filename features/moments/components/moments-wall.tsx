"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ky from "ky";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Disc3,
  Globe,
  Hand,
  MapPin,
  Maximize,
  Minus,
  MousePointerClick,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUser } from "@/features/profile/hooks/user";
import {
  getDaysTogether,
  getUpcomingSpecialDays,
} from "@/features/moments/anniversary";
import {
  clamp,
  decodeLandMask,
  earthRadiusMeters,
  maxRadius,
  orthoForward,
  panCamera,
  sphericalCenter,
  wrapLon,
  zoomCamera,
  zoomLevelName,
  type GlobeCamera,
  type LandMask,
  type LonLat,
} from "@/features/moments/globe";
import {
  parseMapLayer,
  tripRoute,
  type MapLayer,
} from "@/features/moments/map-layers";
import { MapLayers } from "@/features/moments/components/map-layers";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { useTrips } from "@/features/two-dos/hooks/use-trips";
import { listTodos } from "@/features/two-dos/lists";
import { useNotes } from "@/features/moments/hooks/use-notes";
import { useSongPlayer } from "@/features/moments/hooks/use-song-player";
import { useSpecialDays } from "@/features/moments/hooks/use-special-days";
import type { NotePositionRequest } from "@/features/moments/models/requests";
import type { Note, NotePlace } from "@/features/moments/models/responses";
import {
  WallNote,
  type NoteMotion,
} from "@/features/moments/components/wall-note";
import { WallCalendar } from "@/features/moments/components/wall-calendar";
import { SpecialDaysDialog } from "@/features/moments/components/special-days-dialog";
import { NoteEditor } from "@/features/moments/components/note-editor";
import { NotePad } from "@/features/moments/components/note-pad";
import { LoveMapCard } from "@/features/moments/components/love-map-card";
import {
  GlobeLayer,
  type GlobePin,
  type RouteSegment,
} from "@/features/moments/components/globe-layer";
import { HeartIcon } from "@/features/moments/components/heart-icon";

interface WallCamera {
  x: number;
  y: number;
  z: number;
}
interface Point {
  x: number;
  y: number;
}

const noteSize = 210;
const minZoom = 0.25;
const maxZoom = 2.5;
// The design is laid out on a 1440px-wide world.
const designWidth = 1440;
const defaultBoard = { width: 1440, height: 828 };
// Title block, calendar and Love Map card, framed by "fit" along with the notes.
const fixedBoxes = [
  { x: 86, y: 40, w: 760, h: 200 },
  { x: 878, y: 54, w: 176, h: 240 },
  { x: 1000, y: 548, w: 300, h: 196 },
];
const pendingNoteId = "new-note";
const holdMs = 450;
const dragThreshold = 6;
// A click right after a drag or hold is the end of that gesture, not a tap.
const quietMs = 400;
const hearts = [
  { left: "4%", size: 22, color: "#E7A6B1", delay: "0s", duration: "7s" },
  { left: "12%", size: 16, color: "#9DB4DB", delay: "1.8s", duration: "8.5s" },
  { left: "21%", size: 28, color: "#C96B7B", delay: "3.2s", duration: "9s" },
  { left: "30%", size: 18, color: "#E7A6B1", delay: ".6s", duration: "7.5s" },
  { left: "39%", size: 24, color: "#9DB4DB", delay: "4.4s", duration: "8s" },
  { left: "48%", size: 14, color: "#C96B7B", delay: "2.4s", duration: "6.8s" },
  { left: "57%", size: 26, color: "#E7A6B1", delay: "5.2s", duration: "9.5s" },
  { left: "65%", size: 18, color: "#9DB4DB", delay: "1.2s", duration: "7.2s" },
  { left: "73%", size: 22, color: "#C96B7B", delay: "3.8s", duration: "8.2s" },
  { left: "81%", size: 16, color: "#E7A6B1", delay: ".2s", duration: "7.8s" },
  { left: "89%", size: 28, color: "#9DB4DB", delay: "2.9s", duration: "9.2s" },
  { left: "95%", size: 18, color: "#C96B7B", delay: "4.9s", duration: "7.4s" },
];

const chip =
  "inline-flex items-center rounded-full border border-us-line bg-us-chip text-xs font-extrabold text-us-muted";
const floating =
  "border border-us-line bg-us-surface shadow-[0_14px_28px_-16px_rgba(31,43,66,.55)]";
const roundButton =
  "flex size-11 cursor-pointer items-center justify-center rounded-full text-us-ink hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]";

let landMaskRequest: Promise<LandMask> | null = null;
// Fetched and decoded once per page, the first time the map opens.
function loadLandMask() {
  landMaskRequest ??= ky
    .get("/moments/land-mask.json")
    .json<{ w: number; h: number; rle: string }>()
    .then(decodeLandMask)
    .catch((error: unknown) => {
      landMaskRequest = null;
      throw error;
    });
  return landMaskRequest;
}

function homeCamera(width: number): WallCamera {
  const z = clamp(width / designWidth, 0.5, 1);
  return { x: Math.max(0, (width - designWidth * z) / 2), y: 0, z };
}

// Places in the order notes first used them, each with its notes.
function groupByPlace(notes: Note[]) {
  const groups = new Map<string, { place: NotePlace; notes: Note[] }>();
  for (const note of notes) {
    if (!note.place) continue;
    const group = groups.get(note.place.placeId);
    if (group) group.notes.push(note);
    else groups.set(note.place.placeId, { place: note.place, notes: [note] });
  }
  return [...groups.values()];
}

const earliestDate = (notes: Note[]) =>
  notes.reduce((min, note) => {
    const date = note.date ?? "9999";
    return date < min ? date : min;
  }, "9999");

const placeLonLat = ({
  longitude,
  latitude,
}: Pick<NotePlace, "longitude" | "latitude">) => ({
  lon: longitude,
  lat: latitude,
});

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const isTripLayer = (layer: MapLayer) =>
  layer !== "notes" && layer !== "inspiration" && layer !== "unsorted";

const fitLabels = {
  notes: "Fit our places",
  trip: "Fit this trip",
  list: "Fit these places",
};

function MomentsWall() {
  const { key: notesKey, notes, mutate: mutateNotes } = useNotes();
  const {
    key: specialDaysKey,
    specialDays,
    isLoading: specialDaysLoading,
    mutate: mutateSpecialDays,
  } = useSpecialDays();
  const { user: viewer } = useUser();
  const songPlayer = useSongPlayer();
  const isPhone = useMediaQuery("(max-width: 900px)");
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  // /moments and /map share this wall; the path picks the mode, ?layer= what the map shows
  const mode = usePathname() === "/map" ? "map" : "wall";
  const layerParam = useSearchParams().get("layer");
  const { todos, isLoading: todosLoading } = useTodos();
  const { trips, isLoading: tripsLoading } = useTrips();
  // Until both load a trip id is unknown, so the map shows Notes meanwhile
  const layer: MapLayer =
    todosLoading || tripsLoading
      ? "notes"
      : parseMapLayer(
          layerParam,
          trips.map((trip) => trip.id),
        );

  const boardRef = useRef<HTMLElement>(null);
  const [board, setBoard] = useState<{ width: number; height: number }>();
  const { width, height } = board ?? defaultBoard;
  // Read on the client only, so the server never renders another timezone's day.
  const [now, setNow] = useState<number | null>(null);

  // The mode the state below was last reset for; a route change resets it during render
  const [shownMode, setShownMode] = useState(mode);
  // null follows the home camera for the current board width until the viewer moves it.
  const [wallCamera, setWallCamera] = useState<WallCamera | null>(null);
  const [cameraTransition, setCameraTransition] = useState<
    "none" | "fast" | "slow"
  >("none");
  const [globeCamera, setGlobeCamera] = useState<GlobeCamera | null>(null);
  // In map mode, notes follow the globe instantly once the entry flight has landed.
  const [mapLive, setMapLive] = useState(false);
  const [panning, setPanning] = useState(false);
  const [landMask, setLandMask] = useState<LandMask | null>(null);

  const [press, setPress] = useState<{ noteId: string } & Point>();
  const [drag, setDrag] = useState<{ noteId: string } & Point>();
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [closingNoteId, setClosingNoteId] = useState<string | null>(null);
  const [bubbleNoteId, setBubbleNoteId] = useState<string | null>(null);
  const [pending, setPending] = useState<Note | null>(null);
  const [pendingDragging, setPendingDragging] = useState(false);
  const [editing, setEditing] = useState<{
    noteId: string;
    isNew: boolean;
  } | null>(null);
  const [specialOpen, setSpecialOpen] = useState(false);

  const noteGesture = useRef<{
    noteId: string;
    start: Point;
    offset: Point;
    position: Point | null;
    moved: boolean;
    held: boolean;
  } | null>(null);
  const padGesture = useRef<{ start: Point; created: boolean } | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const panGesture = useRef<{
    start: Point;
    distance: number;
    mid: Point;
    wall: WallCamera;
    globe: GlobeCamera;
    pinch: boolean;
  } | null>(null);
  const playingRef = useRef<string | null>(null);
  const quietUntil = useRef(0);
  const timers = useRef<Record<string, number>>({});
  const animationFrame = useRef(0);

  const camera = wallCamera ?? homeCamera(width);
  const isMap = mode === "map";
  const minGlobeRadius = Math.min(width, height) * 0.3;
  const baseGlobeRadius = Math.min(width, height) * 0.42;

  const scheduleTimer = (name: string, ms: number, run: () => void) => {
    window.clearTimeout(timers.current[name]);
    timers.current[name] = window.setTimeout(run, ms);
  };

  useLayoutEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const measure = () => {
      if (element.clientWidth > 0) {
        setBoard({ width: element.clientWidth, height: element.clientHeight });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    const pendingTimers = timers.current;
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
      Object.values(pendingTimers).forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  useEffect(() => {
    if (!isMap || landMask) return;
    loadLandMask().then(setLandMask, (error: unknown) => {
      console.error("Failed to load the land mask:", error);
    });
  }, [isMap, landMask]);

  // ---------- derived ----------

  const maxZ = notes.reduce((max, note) => Math.max(max, note.z), -1);
  const places = groupByPlace(notes);
  const upcoming = now === null ? [] : getUpcomingSpecialDays(now, specialDays);
  const isSpecialToday = upcoming[0]?.daysLeft === 0;

  const entryGlobe = (): GlobeCamera => {
    if (!places.length) return { lon: 150, lat: 20, radius: baseGlobeRadius };
    const center = sphericalCenter(
      places.map(({ place }) => placeLonLat(place)),
    );
    return {
      lon: center.lon,
      lat: clamp(center.lat * 0.6, -60, 60),
      radius: baseGlobeRadius,
    };
  };
  const globe = globeCamera ?? entryGlobe();

  // A to-do layer: its list in order; only the stops with a place become pins.
  const layerTodos = layer === "notes" ? [] : listTodos(todos, layer);
  const located = layerTodos.flatMap((todo, index) =>
    todo.location ? [{ todo, index, location: todo.location }] : [],
  );
  const fitLabel =
    layer === "notes"
      ? fitLabels.notes
      : isTripLayer(layer)
        ? fitLabels.trip
        : fitLabels.list;

  // Frames every point, or falls back to the entry view when one is on the far side.
  // single is how many meters a pixel covers around a lone point; side keeps clear of the edges.
  const framePoints = (
    points: LonLat[],
    single: number,
    side: number,
  ): GlobeCamera | null => {
    if (!points.length) return null;
    if (points.length === 1) {
      const [point] = points;
      return { ...point, radius: earthRadiusMeters / single };
    }
    const center = sphericalCenter(points);
    const unit = { lon: center.lon, lat: center.lat, radius: 1 };
    let maxX = 0;
    let maxY = 0;
    let minY = 0;
    let behind = false;
    for (const point of points) {
      const q = orthoForward(point.lon, point.lat, unit);
      if (q.c < 0.05) behind = true;
      maxX = Math.max(maxX, Math.abs(q.x));
      maxY = Math.max(maxY, q.y);
      minY = Math.min(minY, q.y);
    }
    if (behind) return { ...center, radius: baseGlobeRadius };
    const limits = [(width / 2 - side) / Math.max(maxX, 1e-6)];
    if (maxY > 0) limits.push((height / 2 - 190) / maxY);
    if (minY < 0) limits.push((height / 2 - 110) / -minY);
    return {
      ...center,
      radius: clamp(Math.min(...limits), minGlobeRadius, maxRadius),
    };
  };

  // Clear of the Show on map card on desktop; phones keep only a small margin
  const fitSide = width > 760 ? 380 : 60;
  // Notes fall back to the entry view; a to-do layer with no places keeps the current view.
  const fitGlobe = (): GlobeCamera | null =>
    layer === "notes"
      ? (framePoints(
          places.map(({ place }) => placeLonLat(place)),
          150,
          fitSide,
        ) ?? entryGlobe())
      : framePoints(
          located.map(({ location }) => placeLonLat(location)),
          1200,
          fitSide,
        );

  const flyToFit = () => {
    const target = fitGlobe();
    if (target) flyGlobe(target);
  };

  // A route change resets the per-mode state here, before paint, so the camera's
  // slow transition is already on when the wall flies into the globe.
  if (shownMode !== mode) {
    setShownMode(mode);
    setPress(undefined);
    setDrag(undefined);
    setBubbleNoteId(null);
    setCameraTransition("slow");
    setPanning(false);
    setMapLive(false);
    if (mode === "map") setGlobeCamera(entryGlobe());
  }

  // Notes with a place sit above its pin, fanned out; the rest fade away.
  const mapTargets = new Map<
    string,
    { x: number; y: number; rotation: number; behind: boolean }
  >();
  const pins: GlobePin[] = [];
  const mapScale = clamp(
    0.45 + 0.075 * Math.log2(globe.radius / baseGlobeRadius),
    0.42,
    0.62,
  );
  if (isMap && layer !== "notes") {
    for (const { todo, index, location } of located) {
      const q = orthoForward(location.longitude, location.latitude, globe);
      const x = width / 2 + q.x;
      pins.push({
        placeId: todo.id,
        name: todo.title,
        mark: todo.status ? "done" : isTripLayer(layer) ? index + 1 : "idea",
        labelLeft: x > width - 230,
        x,
        y: height / 2 - q.y,
        visible: q.c > 0.04,
      });
    }
  }
  if (isMap && layer === "notes") {
    for (const { place, notes: group } of places) {
      const q = orthoForward(place.longitude, place.latitude, globe);
      const x = width / 2 + q.x;
      const y = height / 2 - q.y;
      const visible = q.c > 0.04;
      pins.push({
        placeId: place.placeId,
        name: place.name,
        count: group.length,
        x,
        y,
        visible,
      });
      const byDate = group.toSorted((a, b) =>
        (a.date ?? "9") < (b.date ?? "9") ? -1 : 1,
      );
      byDate.forEach((note, index) => {
        const offset = index - (byDate.length - 1) / 2;
        mapTargets.set(note.noteId, {
          x: x - noteSize / 2 + offset * noteSize * mapScale * 0.72,
          y: y - noteSize - 34,
          rotation: offset * 8,
          behind: !visible,
        });
      });
    }
  }
  const notesRoute = places
    .map((group) => ({ ...group, first: earliestDate(group.notes) }))
    .toSorted((a, b) => (a.first < b.first ? -1 : 1))
    .map(({ place }) => placeLonLat(place));
  let route: RouteSegment[] = [];
  if (layer === "notes") {
    route = notesRoute.slice(1).map((to, index) => ({
      from: notesRoute[index],
      to,
      solid: false,
    }));
  } else if (isTripLayer(layer)) {
    route = tripRoute(layerTodos);
  }
  const mappedCount = places.reduce(
    (sum, group) => sum + group.notes.length,
    0,
  );

  let mapInfo = `${places.length} places · ${mappedCount} notes on the map`;
  if (layer === "inspiration") {
    mapInfo = `Inspiration · ${plural(layerTodos.length, "idea", "ideas")} not on a trip yet`;
  } else if (layer === "unsorted") {
    mapInfo = `Unsorted · ${layerTodos.length} done, waiting for a trip`;
  } else if (layer !== "notes") {
    const trip = trips.find((other) => other.id === layer);
    mapInfo = `${trip?.name ?? ""} · ${layerTodos.length} stops in itinerary order`;
  }

  // ---------- coordinates ----------

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = boardRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  // In map mode the world is unscaled board space.
  const toWorld = (event: { clientX: number; clientY: number }) => {
    const point = local(event);
    const live = isMap ? { x: 0, y: 0, z: 1 } : camera;
    return {
      x: (point.x - live.x) / live.z,
      y: (point.y - live.y) / live.z,
      screen: point,
    };
  };

  const moveWall = (next: WallCamera, transition: "none" | "fast") => {
    setWallCamera(next);
    setCameraTransition(transition);
  };

  const zoomWallAt = (
    px: number,
    py: number,
    zoom: number,
    transition: "none" | "fast",
  ) => {
    const z = clamp(zoom, minZoom, maxZoom);
    const factor = z / camera.z;
    moveWall(
      { x: px - (px - camera.x) * factor, y: py - (py - camera.y) * factor, z },
      transition,
    );
  };

  const fitWall = () => {
    const boxes = [
      ...fixedBoxes,
      ...notes.map((note) => ({
        x: note.x,
        y: note.y,
        w: noteSize,
        h: noteSize,
      })),
    ];
    const x0 = Math.min(...boxes.map((box) => box.x));
    const y0 = Math.min(...boxes.map((box) => box.y));
    const x1 = Math.max(...boxes.map((box) => box.x + box.w));
    const y1 = Math.max(...boxes.map((box) => box.y + box.h));
    const padX = width < 900 ? 24 : 64;
    const padTop = width < 900 ? 64 : 40;
    const padBottom = 96;
    const w = x1 - x0;
    const h = y1 - y0;
    const z = clamp(
      Math.min((width - padX * 2) / w, (height - padTop - padBottom) / h),
      minZoom,
      1.5,
    );
    moveWall(
      {
        x: (width - w * z) / 2 - x0 * z,
        y: padTop + (height - padTop - padBottom - h * z) / 2 - y0 * z,
        z,
      },
      "fast",
    );
  };

  // Eased flight between globe cameras: longitude the short way, radius in log space.
  const flyGlobe = (target: GlobeCamera, ms?: number) => {
    const from = globe;
    cancelAnimationFrame(animationFrame.current);
    const dLon = wrapLon(target.lon - from.lon);
    const logFrom = Math.log(from.radius);
    const logTo = Math.log(target.radius);
    const duration =
      ms ?? Math.min(1600, 600 + 110 * Math.abs(logTo - logFrom));
    let startTime: number | null = null;
    const step = (time: number) => {
      startTime ??= time;
      const t = Math.min(1, (time - startTime) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      setMapLive(true);
      setGlobeCamera({
        lon: wrapLon(from.lon + dLon * e),
        lat: from.lat + (target.lat - from.lat) * e,
        radius: Math.exp(logFrom + (logTo - logFrom) * e),
      });
      if (t < 1) animationFrame.current = requestAnimationFrame(step);
    };
    animationFrame.current = requestAnimationFrame(step);
  };

  // ---------- songs ----------

  const stopSong = () => {
    const playing = playingRef.current;
    if (!playing) return;
    playingRef.current = null;
    setPlayingNoteId(null);
    setClosingNoteId(playing);
    scheduleTimer("closing", 360, () => setClosingNoteId(null));
    songPlayer.stop();
  };

  // The rest of a mode switch: what lives outside React state.
  const onModeShown = useEffectEvent(() => {
    stopSong();
    pointers.current.clear();
    panGesture.current = null;
    cancelAnimationFrame(animationFrame.current);
    window.clearTimeout(timers.current.live);
    if (isMap) scheduleTimer("live", 820, () => setMapLive(true));
  });
  // Effect Events always see the latest render and must stay out of the deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onModeShown(), [mode]);

  // Choosing a layer flies to fit it. Entering on Notes keeps today's entry view instead.
  const shownLayer = useRef<MapLayer | null>(null);
  const onLayerShown = useEffectEvent(() => {
    const previous = shownLayer.current;
    shownLayer.current = isMap ? layer : null;
    if (!isMap || previous === layer) return;
    if (previous === null && layer === "notes") return;
    stopSong();
    flyToFit();
  });
  // Effect Events always see the latest render and must stay out of the deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onLayerShown(), [isMap, layer]);

  const pickLayer = (next: MapLayer) =>
    router.replace(
      next === "notes" ? "/map" : `/map?layer=${encodeURIComponent(next)}`,
      { scroll: false },
    );

  // ---------- notes ----------

  const openEditor = (noteId: string, isNew: boolean) => {
    stopSong();
    setPress(undefined);
    setDrag(undefined);
    setEditing({ noteId, isNew });
  };

  const closeEditor = () => {
    if (editing?.isNew) setPending(null);
    setEditing(null);
  };

  const savePosition = async (noteId: string, position: Point, z: number) => {
    const previous = notes;
    void mutateNotes(
      notes.map((note) =>
        note.noteId === noteId ? { ...note, ...position, z } : note,
      ),
      { revalidate: false },
    );
    try {
      await ky.patch(`${notesKey}/${noteId}`, {
        json: { ...position, z } satisfies NotePositionRequest,
        retry: 0,
      });
    } catch {
      void mutateNotes(previous, { revalidate: false });
      toast.error("Failed to move note");
    }
  };

  const deleteNote = async (noteId: string) => {
    const previous = notes;
    setEditing(null);
    void mutateNotes(
      notes.filter((note) => note.noteId !== noteId),
      { revalidate: false },
    );
    try {
      await ky.delete(`${notesKey}/${noteId}`, { retry: 0 });
      toast.success("Note deleted");
    } catch {
      void mutateNotes(previous, { revalidate: false });
      toast.error("Failed to delete note");
    }
  };

  // A saved note keeps its local z, so a note raised by the tap that opened it stays on top.
  const onNoteSaved = (saved: Note) => {
    void mutateNotes(
      (current = []) =>
        current.some((note) => note.noteId === saved.noteId)
          ? current.map((note) =>
              note.noteId === saved.noteId ? { ...saved, z: note.z } : note,
            )
          : [...current, saved],
      { revalidate: false },
    );
    setPending(null);
    setEditing(null);
  };

  const onNotePointerDown = (
    note: Note,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button > 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic or already-released pointer cannot be captured.
    }
    const point = toWorld(event);
    stopSong();
    noteGesture.current = {
      noteId: note.noteId,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: point.x - note.x, y: point.y - note.y },
      position: null,
      moved: false,
      held: false,
    };
    // Pressing a note brings it to the front of the wall, locally until a drag saves it.
    if (
      !isMap &&
      notes.some((other) => other.noteId !== note.noteId && other.z >= note.z)
    ) {
      void mutateNotes(
        notes.map((other) =>
          other.noteId === note.noteId ? { ...other, z: maxZ + 1 } : other,
        ),
        { revalidate: false },
      );
    }
    setPress({ noteId: note.noteId, ...point.screen });
    setBubbleNoteId(null);
    scheduleTimer("hold", holdMs, () => {
      const gesture = noteGesture.current;
      if (!gesture || gesture.moved || gesture.noteId !== note.noteId) return;
      gesture.held = true;
      setPress(undefined);
      if (note.song) {
        window.clearTimeout(timers.current.closing);
        setClosingNoteId(null);
        playingRef.current = note.noteId;
        setPlayingNoteId(note.noteId);
        songPlayer.play(note.song.videoId);
      } else {
        setBubbleNoteId(note.noteId);
        scheduleTimer("bubble", 1700, () => setBubbleNoteId(null));
      }
    });
  };

  const onNotePointerMove = (
    note: Note,
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const gesture = noteGesture.current;
    if (!gesture || gesture.noteId !== note.noteId || gesture.held) return;
    if (!gesture.moved) {
      const distance = Math.hypot(
        event.clientX - gesture.start.x,
        event.clientY - gesture.start.y,
      );
      if (distance < dragThreshold) return;
      gesture.moved = true;
      window.clearTimeout(timers.current.hold);
      setPress(undefined);
    }
    if (isMap) return;
    const point = toWorld(event);
    gesture.position = {
      x: point.x - gesture.offset.x,
      y: point.y - gesture.offset.y,
    };
    setDrag({ noteId: note.noteId, ...gesture.position });
  };

  const onNotePointerUp = (cancelled: boolean) => {
    const gesture = noteGesture.current;
    noteGesture.current = null;
    window.clearTimeout(timers.current.hold);
    if (!gesture) return;
    if (gesture.held) {
      stopSong();
      quietUntil.current = Date.now() + quietMs;
    } else if (gesture.moved) {
      setPress(undefined);
      setDrag(undefined);
      quietUntil.current = Date.now() + quietMs;
      const moved = notes.find((note) => note.noteId === gesture.noteId);
      if (gesture.position && moved) {
        void savePosition(gesture.noteId, gesture.position, moved.z);
      }
    } else {
      setPress(undefined);
      if (cancelled) quietUntil.current = Date.now() + quietMs;
    }
  };

  const onNoteOpen = (note: Note) => {
    if (Date.now() < quietUntil.current) return;
    openEditor(note.noteId, false);
  };

  // ---------- pad ----------

  const blankNote = (x: number, y: number): Note => ({
    noteId: pendingNoteId,
    text: "",
    color: "mist",
    pattern: "plain",
    photoKey: null,
    photoUrl: null,
    song: null,
    place: null,
    date: DateTime.now().toFormat("yyyy-MM-dd"),
    x,
    y,
    rotation: Math.round(Math.random() * 8 - 4),
    z: maxZ + 1,
    author: {
      id: viewer?.id ?? "",
      name: viewer?.name ?? "",
      imageUrl: viewer?.imageUrl ?? null,
    },
    createdAt: new Date().toISOString(),
  });

  const addNoteAtCenter = () => {
    const jitter = () => Math.round(Math.random() * 40 - 20);
    setPending(
      blankNote(
        (width / 2 - camera.x) / camera.z - noteSize / 2 + jitter(),
        (height / 2 - camera.y) / camera.z - noteSize / 2 + jitter(),
      ),
    );
    openEditor(pendingNoteId, true);
  };

  const onPadPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button > 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic or already-released pointer cannot be captured.
    }
    stopSong();
    padGesture.current = {
      start: { x: event.clientX, y: event.clientY },
      created: false,
    };
  };

  const onPadPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = padGesture.current;
    if (!gesture) return;
    const point = toWorld(event);
    const position = {
      x: point.x - noteSize / 2,
      y: point.y - noteSize / 2,
    };
    if (!gesture.created) {
      const distance = Math.hypot(
        event.clientX - gesture.start.x,
        event.clientY - gesture.start.y,
      );
      if (distance < dragThreshold) return;
      gesture.created = true;
      setPending(blankNote(position.x, position.y));
      setPendingDragging(true);
      return;
    }
    setPending((current) => current && { ...current, ...position });
  };

  // A cancel (the browser took the touch) ends the gesture without adding a note.
  const onPadPointerUp = (cancelled: boolean) => {
    const gesture = padGesture.current;
    padGesture.current = null;
    if (!gesture) return;
    if (cancelled) {
      setPendingDragging(false);
      if (gesture.created) setPending(null);
    } else if (gesture.created) {
      setPendingDragging(false);
      openEditor(pendingNoteId, true);
    } else {
      addNoteAtCenter();
    }
  };

  // ---------- board: pan, pinch, wheel ----------

  const blocked = editing !== null || specialOpen;

  const startPan = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a) {
      panGesture.current = null;
      return;
    }
    const mid = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    panGesture.current = {
      start: a,
      distance: b ? Math.hypot(a.x - b.x, a.y - b.y) || 1 : 1,
      mid,
      wall: camera,
      globe,
      pinch: Boolean(b),
    };
  };

  // Empty wall only: notes, controls and fields handle their own pointers.
  const isWallTarget = (target: EventTarget) =>
    !(
      target instanceof Element &&
      target.closest(
        "[data-nopan], [data-note], button, a, input, label, textarea",
      )
    );

  const onBoardPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (blocked || !isWallTarget(event.target)) return;
    if (
      event.pointerType === "mouse" &&
      event.button !== 0 &&
      event.button !== 1
    )
      return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic or already-released pointer cannot be captured.
    }
    pointers.current.set(event.pointerId, local(event));
    cancelAnimationFrame(animationFrame.current);
    startPan();
    setPanning(true);
    if (isMap) setMapLive(true);
    else setCameraTransition("none");
  };

  const onBoardPointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = panGesture.current;
    if (!gesture || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event));
    const [a, b] = [...pointers.current.values()];
    if (!gesture.pinch) {
      const dx = a.x - gesture.start.x;
      const dy = a.y - gesture.start.y;
      if (isMap)
        setGlobeCamera(panCamera(gesture.globe, dx, dy, minGlobeRadius));
      else
        moveWall(
          { ...gesture.wall, x: gesture.wall.x + dx, y: gesture.wall.y + dy },
          "none",
        );
      return;
    }
    if (!b) return;
    const ratio = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / gesture.distance;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (isMap) {
      const zoomed = zoomCamera(
        gesture.globe,
        gesture.mid.x - width / 2,
        gesture.mid.y - height / 2,
        gesture.globe.radius * ratio,
        minGlobeRadius,
      );
      setGlobeCamera(
        panCamera(
          zoomed,
          mid.x - gesture.mid.x,
          mid.y - gesture.mid.y,
          minGlobeRadius,
        ),
      );
      return;
    }
    const z = clamp(gesture.wall.z * ratio, minZoom, maxZoom);
    const worldX = (gesture.mid.x - gesture.wall.x) / gesture.wall.z;
    const worldY = (gesture.mid.y - gesture.wall.y) / gesture.wall.z;
    moveWall({ x: mid.x - worldX * z, y: mid.y - worldY * z, z }, "none");
  };

  const onBoardPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    startPan();
    if (!panGesture.current) setPanning(false);
  };

  const onBoardDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if (!isMap || blocked || !isWallTarget(event.target)) return;
    const point = local(event);
    flyGlobe(
      zoomCamera(
        globe,
        point.x - width / 2,
        point.y - height / 2,
        globe.radius * 2.5,
        minGlobeRadius,
      ),
      520,
    );
  };

  // Trackpad scroll pans; Ctrl/⌘ + wheel (and trackpad pinch) zooms at the pointer.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (blocked) return;
    if (event.target instanceof Element && event.target.closest("[data-nopan]"))
      return;
    event.preventDefault();
    const point = local(event);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (isMap) {
      cancelAnimationFrame(animationFrame.current);
      const factor = Math.exp(
        -clamp(dy, -120, 120) * (event.ctrlKey ? 0.012 : 0.0028),
      );
      setMapLive(true);
      setGlobeCamera(
        zoomCamera(
          globe,
          point.x - width / 2,
          point.y - height / 2,
          globe.radius * factor,
          minGlobeRadius,
        ),
      );
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      zoomWallAt(
        point.x,
        point.y,
        camera.z * Math.exp(-clamp(dy, -60, 60) * 0.01),
        "none",
      );
    } else {
      moveWall({ ...camera, x: camera.x - dx, y: camera.y - dy }, "none");
    }
  });

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    // React's onWheel is passive and cannot stop the page from zooming.
    const listener = (event: WheelEvent) => onWheel(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
    // onWheel is an Effect Event: it always sees the latest state and must stay out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- zoom bar ----------

  const levelName = zoomLevelName(globe.radius);
  const zoomPercent = Math.round(camera.z * 100);

  const zoomStep = (factor: number) => {
    if (isMap) {
      flyGlobe(
        {
          ...globe,
          radius: clamp(globe.radius * factor, minGlobeRadius, maxRadius),
        },
        480,
      );
    } else {
      zoomWallAt(width / 2, height / 2, camera.z * factor, "fast");
    }
  };

  const zoomReset = () => {
    if (isMap) {
      flyGlobe({
        lon: globe.lon,
        lat: clamp(globe.lat, -35, 50),
        radius: baseGlobeRadius,
      });
    } else {
      zoomWallAt(width / 2, height / 2, 1, "fast");
    }
  };

  // ---------- render ----------

  let gridSize = 24 * camera.z;
  while (gridSize < 14) gridSize *= 2;

  const displayNotes = pending ? [...notes, pending] : notes;
  const topZ = Math.max(maxZ, pending?.z ?? 0) + 2;
  const editingNote = editing
    ? editing.isNew
      ? pending
      : notes.find((note) => note.noteId === editing.noteId)
    : null;
  const wallOnly = cn(
    "transition-opacity duration-350",
    isMap && "pointer-events-none opacity-0",
  );
  const liveCamera = isMap ? { x: 0, y: 0, z: 1 } : camera;

  return (
    <section
      ref={boardRef}
      aria-label="Moments wall"
      onPointerDown={onBoardPointerDown}
      onPointerMove={onBoardPointerMove}
      onPointerUp={onBoardPointerUp}
      onPointerCancel={onBoardPointerUp}
      onDoubleClick={onBoardDoubleClick}
      className={cn(
        "us-palette relative z-20 min-h-0 flex-1 touch-none overflow-hidden bg-us-wall bg-[radial-gradient(var(--us-dot)_1.2px,transparent_1.7px)] font-ui text-us-ink transition-[background-color] duration-500",
        !blocked && "cursor-grab",
        panning && "cursor-grabbing **:cursor-grabbing!",
      )}
      style={{
        backgroundSize: `${gridSize.toFixed(2)}px ${gridSize.toFixed(2)}px`,
        backgroundPosition: `${camera.x.toFixed(1)}px ${camera.y.toFixed(1)}px`,
      }}
    >
      <GlobeLayer
        active={isMap}
        pins={pins}
        camera={globe}
        width={width}
        height={height}
        dark={resolvedTheme === "dark"}
        landMask={landMask}
        route={route}
      />

      <div
        className={cn(
          "absolute top-0 left-0 z-1 size-0 origin-top-left",
          cameraTransition === "fast" &&
            "transition-transform duration-400 ease-us",
          cameraTransition === "slow" &&
            "transition-transform duration-750 ease-us-slow",
        )}
        style={{
          transform: `translate(${liveCamera.x.toFixed(1)}px, ${liveCamera.y.toFixed(1)}px) scale(${liveCamera.z.toFixed(4)})`,
        }}
      >
        <svg
          aria-hidden="true"
          width="64"
          height="58"
          viewBox="0 0 64 58"
          fill="none"
          stroke="#9DB4DB"
          strokeWidth="2.4"
          strokeLinecap="round"
          className={cn("absolute top-53.5 left-196.25 rotate-12", wallOnly)}
        >
          <path d="M32 52C18 42 6 32 6 19 6 10 13 5 20 5c6 0 10 4 12 9 2-5 6-9 12-9 7 0 14 5 14 14 0 13-12 23-26 33z" />
        </svg>

        {/* The whole wall header fades out on the map; the map keeps only a hidden heading */}
        <div
          aria-hidden={isMap}
          className={cn(
            "pointer-events-none absolute top-10 left-21.5 z-1 flex flex-col gap-1",
            wallOnly,
          )}
        >
          <div className="flex items-center gap-2">
            <span className={cn(chip, "px-3 py-1.75")}>Since 2022</span>
            {now !== null ? (
              <span className={cn(chip, "px-3 py-1.75")}>
                Day {getDaysTogether(now)}
              </span>
            ) : null}
          </div>
          <h1 className="m-0 origin-left -rotate-3 pt-3.5 pl-1 font-title text-[92px] leading-[1.35] font-normal whitespace-nowrap text-us-ink">
            Our <span className="text-us-accent">Moments</span>
          </h1>
          <svg
            aria-hidden="true"
            width="340"
            height="22"
            viewBox="0 0 340 22"
            fill="none"
            stroke="#9DB4DB"
            strokeWidth="3"
            strokeLinecap="round"
            className="-mt-4.5 ml-57.5 -rotate-3"
          >
            <path d="M4 14C70 4 150 2 230 8c40 3 76 6 104 2" />
          </svg>
          <p className="mt-2.5 max-w-105 text-[17px] leading-[1.6] font-semibold text-us-muted">
            A shared home for our photos, notes, plans, and the small moments
            that keep adding up.
          </p>
        </div>
        {isMap ? <h2 className="sr-only">Map</h2> : null}

        <div className="contents" inert={isMap}>
          {upcoming.length ? (
            <WallCalendar
              upcoming={upcoming}
              now={now ?? 0}
              ready={!specialDaysLoading}
              onOpen={() => {
                stopSong();
                setSpecialOpen(true);
              }}
              className={cn(
                "absolute top-13.5 left-219.5 z-4",
                isMap && "pointer-events-none opacity-0",
              )}
            />
          ) : null}
          <LoveMapCard
            places={places.map(({ place }) => place)}
            onOpen={() => router.push("/map")}
            className={cn(isMap && "pointer-events-none opacity-0")}
          />
        </div>

        {displayNotes.map((note) => {
          const target = isMap ? mapTargets.get(note.noteId) : undefined;
          const dragged =
            drag?.noteId === note.noteId ||
            (pendingDragging && note.noteId === pendingNoteId);
          const motion: NoteMotion =
            playingNoteId === note.noteId
              ? "playing"
              : dragged
                ? "dragging"
                : closingNoteId === note.noteId
                  ? "closing"
                  : press?.noteId === note.noteId
                    ? "pressing"
                    : "idle";
          const position =
            target ?? (drag?.noteId === note.noteId ? drag : note);
          return (
            <WallNote
              key={note.noteId}
              note={note}
              viewerId={viewer?.id}
              left={position.x}
              top={position.y}
              rotation={target ? target.rotation : note.rotation}
              scale={target ? mapScale : 1}
              zIndex={
                motion === "playing" || motion === "dragging" ? topZ : note.z
              }
              motion={motion}
              away={isMap && !target}
              behind={target?.behind ?? false}
              tracking={isMap && mapLive}
              showBubble={bubbleNoteId === note.noteId}
              onPointerDown={onNotePointerDown}
              onPointerMove={onNotePointerMove}
              onPointerUp={onNotePointerUp}
              onOpen={onNoteOpen}
            />
          );
        })}
      </div>

      <div className="contents" inert={isMap}>
        <NotePad
          className={wallOnly}
          onPointerDown={onPadPointerDown}
          onPointerMove={onPadPointerMove}
          onPointerUp={onPadPointerUp}
          onKeyboardPress={addNoteAtCenter}
        />
      </div>

      {press ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 64 64"
          className="pointer-events-none absolute z-950 -mt-8 -ml-8 size-16 animate-ring-in opacity-0"
          style={{ left: `${press.x}px`, top: `${press.y}px` }}
        >
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="rgba(255,255,255,.35)"
            stroke="rgba(31,43,66,.15)"
            strokeWidth="4"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="#4F70A8"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            className="animate-ring-fill [stroke-dasharray:176] [stroke-dashoffset:176]"
          />
        </svg>
      ) : null}

      {isSpecialToday ? (
        <div aria-hidden="true" className="motion-reduce:hidden">
          {hearts.map((heart) => (
            <HeartIcon
              key={heart.left}
              className="pointer-events-none absolute -bottom-10 z-1200 animate-float-up opacity-0"
              style={{
                left: heart.left,
                width: heart.size,
                height: heart.size,
                color: heart.color,
                animationDelay: heart.delay,
                animationDuration: heart.duration,
              }}
            />
          ))}
        </div>
      ) : null}

      {isMap ? null : (
        <>
          <div className="pointer-events-none absolute bottom-7 left-10 z-1000 flex flex-wrap gap-2 max-[900px]:hidden">
            {[
              { icon: MousePointerClick, label: "Tap to open" },
              { icon: Disc3, label: "Hold to hear its song" },
              { icon: Hand, label: "Drag the wall to look around" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className={cn(chip, "gap-1.75 px-3.25 py-2 text-[12.5px]")}
              >
                <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
          <span
            className={cn(
              chip,
              "pointer-events-none absolute bottom-31 left-3 z-1000 px-2.75 py-1.5 text-[11.5px] min-[901px]:hidden",
            )}
          >
            Hold a note to hear its song · pinch to zoom
          </span>
        </>
      )}

      {isMap ? (
        <MapLayers
          layer={layer}
          isPhone={isPhone}
          noteCounts={{ places: places.length, notes: mappedCount }}
          todos={todos}
          trips={trips}
          onPick={pickLayer}
          onFly={({ location }) => {
            if (location) {
              flyGlobe({
                ...placeLonLat(location),
                radius: earthRadiusMeters / 600,
              });
            }
          }}
        />
      ) : null}

      {isMap && !isPhone ? (
        <div
          data-nopan=""
          className="absolute bottom-7 left-10 z-1000 flex animate-[fade_.4s_.2s_ease_both] flex-wrap items-center gap-2"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-us-line bg-us-surface px-3.5 py-2 text-[13px] font-extrabold text-us-ink">
            <MapPin
              size={15}
              strokeWidth={2.4}
              className="text-[#4F70A8]"
              aria-hidden="true"
            />
            {mapInfo}
          </span>
          <span className={cn(chip, "px-3.5 py-2 text-[12.5px]")}>
            Drag to spin · scroll or pinch to zoom
          </span>
          {layer === "notes" ? null : (
            <Link
              href={`/twodo?list=${encodeURIComponent(layer)}`}
              className="inline-flex h-9.5 items-center gap-2 rounded-full border border-us-line bg-us-surface px-3.5 text-[13px] font-extrabold text-us-ink hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
            >
              Open in Two Do
              <ArrowRight size={14} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : null}

      {isMap && isPhone ? (
        <div data-nopan="">
          <span
            className={cn(
              chip,
              "absolute bottom-21.5 left-3 z-5 h-8.5 gap-1.5 px-2.75 text-[11.5px]",
            )}
          >
            Drag to spin · pinch to zoom
          </span>
          <button
            type="button"
            aria-label={`Zoom level: ${levelName}. ${fitLabel}`}
            onClick={flyToFit}
            className={cn(
              floating,
              "absolute right-3 bottom-20.5 z-5 inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-extrabold text-us-ink focus-visible:outline-3 focus-visible:outline-[#4F70A8]",
            )}
          >
            <Globe size={15} strokeWidth={2.2} aria-hidden="true" />
            {levelName}
          </button>
        </div>
      ) : null}

      <div
        data-nopan=""
        role="group"
        aria-label="Zoom"
        className={cn(
          floating,
          "absolute right-6 bottom-6 z-1500 flex items-center gap-0.5 rounded-full p-1 max-[900px]:right-auto max-[900px]:bottom-4 max-[900px]:left-3",
          // Phones fit the globe with the Globe button instead.
          isMap && "max-[900px]:hidden",
        )}
      >
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomStep(isMap ? 1 / 2.2 : 1 / 1.25)}
          className={cn(roundButton, "max-[900px]:hidden")}
        >
          <Minus size={16} strokeWidth={2.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={
            isMap
              ? `Zoom level: ${levelName}. Show the whole globe`
              : `Zoom ${zoomPercent}%. Reset to 100%`
          }
          onClick={zoomReset}
          className="h-11 min-w-15.5 cursor-pointer rounded-full px-2.5 text-[13px] font-extrabold whitespace-nowrap text-us-ink tabular-nums hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8] max-[900px]:min-w-14.5 max-[900px]:px-2"
        >
          {isMap ? levelName : `${zoomPercent}%`}
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomStep(isMap ? 2.2 : 1.25)}
          className={cn(roundButton, "max-[900px]:hidden")}
        >
          <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
        </button>
        <span
          aria-hidden="true"
          className="mx-1 h-5.5 w-px bg-us-hair max-[900px]:mx-0"
        />
        <button
          type="button"
          aria-label={isMap ? fitLabel : "Fit everything on screen"}
          onClick={() => (isMap ? flyToFit() : fitWall())}
          className={roundButton}
        >
          {isMap ? (
            <Globe size={17} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Maximize size={17} strokeWidth={2.4} aria-hidden="true" />
          )}
        </button>
      </div>

      {editing && editingNote ? (
        <NoteEditor
          note={editingNote}
          isNew={editing.isNew}
          notes={notes}
          viewerId={viewer?.id}
          playingVideoId={songPlayer.playingVideoId}
          onPlay={songPlayer.play}
          onStop={songPlayer.stop}
          onClose={closeEditor}
          onSaved={onNoteSaved}
          onDelete={deleteNote}
        />
      ) : null}

      {specialOpen && upcoming.length ? (
        <SpecialDaysDialog
          upcoming={upcoming}
          apiKey={specialDaysKey}
          onChanged={() => mutateSpecialDays()}
          onClose={() => setSpecialOpen(false)}
        />
      ) : null}
    </section>
  );
}

export { MomentsWall };
