"use client";

import Image from "next/image";
import Script from "next/script";
import ky, { HTTPError } from "ky";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Music2, Play, Search, Share2, Square } from "lucide-react";
import { toast } from "sonner";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpErrorPayload } from "@/lib/error";
import { cn } from "@/lib/utils";
import { useSharedMusic } from "@/features/music/hooks/use-shared-music";
import {
  MusicResponse,
  MusicSelectionResponse,
  MusicSearchResponse,
  MusicSearchResult,
} from "@/features/music/models/responses";
import { musicSelectionRequestSchema } from "@/features/music/models/requests";

interface YouTubePlayer {
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideoById: (videoId: string) => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  stopVideo: () => void;
}

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: YouTubePlayer }) => void;
      onStateChange?: (event: { data: number }) => void;
    };
  },
) => YouTubePlayer;

declare global {
  interface Window {
    YT?: {
      Player?: YouTubePlayerConstructor;
      PlayerState: {
        BUFFERING: number;
        ENDED: number;
        PAUSED: number;
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function SharedMusicPlayer() {
  const { key, user, mine, shared, isLoading, mutate } = useSharedMusic();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [isSearching, startSearching] = useTransition();
  const [isSelecting, startSelecting] = useTransition();
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [youTubePlayerConstructor, setYouTubePlayerConstructor] =
    useState<YouTubePlayerConstructor | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const pendingPlayVideoIdRef = useRef<string | null>(null);

  const activeVideoId = playingVideoId ?? mine?.videoId ?? null;
  const activeMusic = useMemo(
    () =>
      shared.find((music) => music.videoId === activeVideoId) ?? mine ?? null,
    [activeVideoId, mine, shared],
  );

  const updateProgress = useCallback((player = playerRef.current) => {
    if (!player) {
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const nextDuration = player.getDuration();
    if (nextDuration <= 0) {
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const nextCurrentTime = player.getCurrentTime();
    setProgress((nextCurrentTime / nextDuration) * 100);
    setCurrentTime(nextCurrentTime);
    setDuration(nextDuration);
  }, []);

  const markYouTubeApiReady = useCallback(() => {
    const Player = getYouTubePlayerConstructor();
    if (Player) {
      setYouTubePlayerConstructor((current) => current ?? Player);
    }
  }, []);

  useEffect(() => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      markYouTubeApiReady();
    };

    markYouTubeApiReady();

    return () => {
      window.onYouTubeIframeAPIReady = previousReadyHandler;
    };
  }, [markYouTubeApiReady]);

  useEffect(() => {
    const Player = youTubePlayerConstructor;
    if (!Player || !playerHostRef.current || playerRef.current) {
      return;
    }

    const player = new Player(playerHostRef.current, {
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        origin: window.location.origin,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          playerRef.current = event.target;
          setIsPlayerReady(true);
        },
        onStateChange: (event) => {
          const playerState = window.YT?.PlayerState;
          if (!playerState) {
            return;
          }

          if (
            event.data === playerState.PLAYING ||
            event.data === playerState.BUFFERING
          ) {
            pendingPlayVideoIdRef.current = null;
            setIsPlaying(true);
          }

          if (
            event.data === playerState.PAUSED ||
            event.data === playerState.ENDED
          ) {
            if (pendingPlayVideoIdRef.current !== null) {
              updateProgress();
              return;
            }

            setIsPlaying(false);
          }

          updateProgress();
        },
      },
    });

    return () => {
      playerRef.current = null;
      player.destroy();
    };
  }, [updateProgress, youTubePlayerConstructor]);

  useEffect(() => {
    const player = playerRef.current;
    if (!isPlayerReady || !player || !activeVideoId) {
      return;
    }

    if (playingVideoId === activeVideoId) {
      player.loadVideoById(activeVideoId);
      return;
    }

    player.cueVideoById(activeVideoId);
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
  }, [activeVideoId, isPlayerReady, playingVideoId]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      updateProgress(player);
    }, 500);

    return () => window.clearInterval(interval);
  }, [isPlaying, updateProgress]);

  const handleSearch = () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      setResults([]);
      return;
    }

    startSearching(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery });
        const response = await ky
          .get(`/api/music/search?${params.toString()}`)
          .json<MusicSearchResponse>();
        setResults(response.results);
      } catch (error) {
        console.error("Music search failed:", error);
        let errorMessage = "Failed to search YouTube";
        if (error instanceof HTTPError) {
          const errorPayload = await error.response.json<HttpErrorPayload>();
          errorMessage = errorPayload.message;
        }
        toast.error(errorMessage);
      }
    });
  };

  const handleSelect = (result: MusicSearchResult) => {
    startSelecting(async () => {
      try {
        const request = musicSelectionRequestSchema.parse(result);
        await mutate(
          async () => {
            const selected = await ky
              .post(key, {
                json: request,
              })
              .json<MusicSelectionResponse>();

            const nextShared = [
              selected.music,
              ...shared.filter(
                (music) => music.selectedById !== selected.music.selectedById,
              ),
            ];

            return {
              shared: nextShared,
            } satisfies MusicResponse;
          },
          {
            optimisticData: {
              shared: [
                {
                  ...request,
                  selectedById: user?.id ?? mine?.selectedById ?? "",
                  selectedBy: user?.name ?? null,
                  updatedAt: new Date().toISOString(),
                },
                ...shared.filter(
                  (music) =>
                    music.selectedById !== (user?.id ?? mine?.selectedById),
                ),
              ],
            },
            rollbackOnError: true,
            revalidate: false,
          },
        );
        setQuery("");
        setResults([]);
        startVideo(result.videoId);
        toast.success("Shared song updated");
      } catch (error) {
        console.error("Music selection failed:", error);
        toast.error("Failed to share this song");
      }
    });
  };

  const handlePlay = () => {
    if (!activeVideoId || !isPlayerReady) {
      return;
    }

    playVideo(activeVideoId);
  };

  const handleStop = () => {
    pendingPlayVideoIdRef.current = null;
    playerRef.current?.pauseVideo();
    setIsPlaying(false);
    updateProgress();
  };

  const handleSeek = (value: number[]) => {
    const nextProgress = value[0] ?? 0;
    const player = playerRef.current;
    const duration = player?.getDuration() ?? 0;

    setProgress(nextProgress);

    if (!player || duration <= 0) {
      return;
    }

    const nextCurrentTime = (duration * nextProgress) / 100;
    setCurrentTime(nextCurrentTime);
    setDuration(duration);
    player.seekTo(nextCurrentTime, true);
  };

  const playVideo = (videoId: string) => {
    if (playingVideoId !== videoId) {
      startVideo(videoId);
      return;
    }

    playerRef.current?.playVideo();
    setIsPlaying(true);
  };

  const startVideo = (videoId: string) => {
    pendingPlayVideoIdRef.current = videoId;
    setPlayingVideoId(videoId);
    setIsPlaying(true);

    if (!isPlayerReady) {
      return;
    }

    if (playingVideoId === videoId) {
      playerRef.current?.playVideo();
    }
  };

  return (
    <Card className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-4xl py-5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Music2 className="size-5" />
          </span>
          <CardTitle>Shared Song</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
        {isLoading ? (
          <SharedMusicSkeleton />
        ) : (
          <>
            <div
              className={cn(
                "grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr]",
                results.length > 0 && "lg:hidden",
              )}
            >
              <AspectRatio
                ratio={1}
                className="relative overflow-hidden rounded-2xl border border-border bg-muted"
              >
                {activeMusic ? (
                  <Image
                    src={activeMusic.thumbnailUrl}
                    alt={activeMusic.title}
                    fill
                    sizes="180px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-primary">
                    <Music2 className="size-12" />
                  </div>
                )}
              </AspectRatio>

              <div className="flex min-w-0 flex-col justify-center">
                <Badge variant="secondary">Now Shared</Badge>
                <h3 className="mt-2 line-clamp-2 text-2xl font-semibold tracking-tight">
                  {activeMusic?.title ?? "Pick a song for us"}
                </h3>
                <p className="mt-2 truncate text-sm text-muted-foreground">
                  {activeMusic?.channelTitle ??
                    "Search YouTube and choose a track"}
                </p>
                {activeMusic?.selectedBy ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Shared by {activeMusic.selectedBy}
                  </p>
                ) : null}
              </div>
            </div>

            {activeVideoId ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="icon"
                    className="rounded-full"
                    disabled={!isPlayerReady}
                    onClick={isPlaying ? handleStop : handlePlay}
                    aria-label={isPlaying ? "Stop song" : "Play song"}
                  >
                    {isPlaying ? (
                      <Square className="fill-current" />
                    ) : (
                      <Play className="fill-current" />
                    )}
                  </Button>
                  <Slider
                    value={[progress]}
                    min={0}
                    max={100}
                    step={0.1}
                    onValueChange={handleSeek}
                    disabled={!isPlayerReady}
                    aria-label="Song progress"
                    className="flex-1"
                  />
                  <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                    {formatPlaybackTime(currentTime)} /{" "}
                    {formatPlaybackTime(duration)}
                  </span>
                </div>
              </div>
            ) : null}

            <div
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 size-px opacity-0"
            >
              <div ref={playerHostRef} />
            </div>
            <Script
              id="youtube-iframe-api"
              src="https://www.youtube.com/iframe_api"
              strategy="lazyOnload"
              onReady={markYouTubeApiReady}
            />
          </>
        )}

        <div className="flex gap-2">
          <Input
            id="shared-music-search"
            name="shared-music-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSearch();
              }
            }}
            placeholder="Search YouTube Music..."
          />
          <Button
            type="button"
            variant="outline"
            disabled={isSearching}
            onClick={handleSearch}
          >
            <Search data-icon="inline-start" />
            <span className="hidden sm:inline">
              {isSearching ? "Searching" : "Search"}
            </span>
          </Button>
        </div>

        {results.length > 0 ? (
          <ScrollArea className="h-72 min-h-0 lg:h-auto lg:flex-1">
            <div className="flex flex-col gap-2 pr-3">
              {results.map((result) => {
                const isPreviewing =
                  playingVideoId === result.videoId && isPlaying;

                return (
                  <div
                    key={result.videoId}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2"
                  >
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image
                        src={result.thumbnailUrl}
                        alt={result.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="line-clamp-1 text-sm font-medium">
                        {result.title}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {result.channelTitle}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      disabled={isSelecting || !isPlayerReady}
                      onClick={
                        isPreviewing
                          ? handleStop
                          : () => playVideo(result.videoId)
                      }
                      aria-label={
                        isPreviewing ? "Stop song preview" : "Play song preview"
                      }
                      className="size-9 shrink-0 rounded-full"
                    >
                      {isPreviewing ? (
                        <Square className="fill-current" />
                      ) : (
                        <Play className="fill-current" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      disabled={isSelecting}
                      onClick={() => handleSelect(result)}
                      aria-label="Select song"
                      className="size-9 shrink-0 rounded-full"
                    >
                      <Share2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : null}

        {shared.length > 0 ? (
          <div className="flex flex-col gap-2 pt-4">
            <Separator />
            <Badge variant="outline">Shared List</Badge>
            {shared.map((music) => (
              <Button
                key={`${music.selectedById}-${music.videoId}`}
                type="button"
                variant="plain"
                onClick={() => startVideo(music.videoId)}
                className="h-auto w-full justify-start whitespace-normal rounded-2xl p-2 text-left hover:bg-muted"
              >
                <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={music.thumbnailUrl}
                    alt={music.title}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-medium">
                    {music.title}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {music.selectedBy ?? music.channelTitle}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SharedMusicSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr]">
      <Skeleton className="aspect-square rounded-2xl" />
      <div className="flex flex-col gap-3 self-center">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function getYouTubePlayerConstructor() {
  const player = window.YT?.Player;
  return typeof player === "function" ? player : null;
}

function formatPlaybackTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export { SharedMusicPlayer };
