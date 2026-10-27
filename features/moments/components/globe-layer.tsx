"use client";

import { useEffect, useRef } from "react";
import { Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  earthRadiusMeters,
  greatCircle,
  isLand,
  orthoForward,
  type GlobeCamera,
  type LandMask,
  type LonLat,
} from "@/features/moments/globe";
import { HeartIcon } from "@/features/moments/components/heart-icon";

// A note place (heart and count) or, with a mark, a to-do (dot and title).
interface GlobePin {
  // The place id, or the to-do id for a to-do pin
  placeId: string;
  name: string;
  count?: number;
  mark?: "idea" | "done" | number;
  // The label sits left of the dot, near the right edge
  labelLeft?: boolean;
  x: number;
  y: number;
  visible: boolean;
}

interface RouteSegment {
  from: LonLat;
  to: LonLat;
  // Solid once both ends are done; dashed is the notes' route style
  solid: boolean;
}

const pinMarks = { idea: "✦", done: "✓" };

const palettes = {
  light: {
    halo: "#E7EDF6",
    disc: "#E1E9F4",
    ocean: "rgba(79,112,168,.18)",
    land: "#A3B9DE",
    rim: "#C9D6EA",
    route: "#4F70A8",
    shade: "rgba(31,43,66,.07)",
  },
  dark: {
    halo: "#0F1828",
    disc: "#152036",
    ocean: "rgba(157,180,219,.13)",
    land: "#4C6A9C",
    rim: "#24345240",
    route: "#8FB0E8",
    shade: "rgba(0,0,0,.3)",
  },
};

// Dots every 12px over the visible disc: land dots large, ocean dots faint, both shrinking toward the rim.
function drawGlobe(
  canvas: HTMLCanvasElement,
  { camera, width, height, dark, landMask, route }: GlobeDrawing,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const colors = dark ? palettes.dark : palettes.light;
  const cx = width / 2;
  const cy = height / 2;
  const radius = camera.radius;
  // Zoomed in past the screen corners, the disc fills everything.
  const filled = radius > Math.hypot(width, height);
  if (filled) {
    ctx.fillStyle = colors.disc;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = colors.halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.disc;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const step = 12;
  const degrees = Math.PI / 180;
  const phi0 = camera.lat * degrees;
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const lambda0 = camera.lon * degrees;
  const land: number[] = [];
  const ocean: number[] = [];
  // Inlined inverse projection: this loop runs for every dot on every frame.
  for (let gy = step / 2; gy < height; gy += step) {
    const y = cy - gy;
    for (let gx = step / 2; gx < width; gx += step) {
      const x = gx - cx;
      const rr = x * x + y * y;
      if (rr > radius * radius) continue;
      const rho = Math.sqrt(rr);
      let lon = camera.lon;
      let lat = camera.lat;
      let cosC = 1;
      if (rho >= 1e-9) {
        const sinC = rho / radius;
        cosC = Math.sqrt(Math.max(0, 1 - sinC * sinC));
        lat =
          Math.asin(
            Math.max(
              -1,
              Math.min(1, cosC * sinPhi0 + (y * sinC * cosPhi0) / rho),
            ),
          ) / degrees;
        lon =
          (lambda0 +
            Math.atan2(x * sinC, rho * cosC * cosPhi0 - y * sinC * sinPhi0)) /
          degrees;
      }
      (landMask && isLand(landMask, lon, lat) ? land : ocean).push(
        gx,
        gy,
        cosC,
      );
    }
  }

  const dots = (points: number[], size: (cosC: number) => number) => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 3) {
      const r = size(points[i + 2]);
      ctx.moveTo(points[i] + r, points[i + 1]);
      ctx.arc(points[i], points[i + 1], r, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  ctx.fillStyle = colors.ocean;
  dots(ocean, (cosC) => 1.1 * (0.5 + 0.5 * cosC));
  ctx.fillStyle = colors.land;
  dots(land, (cosC) => 3.4 * (0.45 + 0.55 * cosC));

  if (!filled) {
    const shade = ctx.createRadialGradient(
      cx,
      cy,
      radius * 0.7,
      cx,
      cy,
      radius,
    );
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, colors.shade);
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.route;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  // One stroke per style, so solid and dashed segments each draw once
  for (const solid of [false, true]) {
    const segments = route.filter((segment) => segment.solid === solid);
    if (!segments.length) continue;
    ctx.setLineDash(solid ? [] : [4, 8]);
    ctx.beginPath();
    for (const { from, to } of segments) {
      let penDown = false;
      for (const point of greatCircle(from, to, 96)) {
        const q = orthoForward(point.lon, point.lat, camera);
        // Lift the pen behind the globe.
        if (q.c > 0) {
          if (penDown) ctx.lineTo(cx + q.x, cy - q.y);
          else ctx.moveTo(cx + q.x, cy - q.y);
          penDown = true;
        } else {
          penDown = false;
        }
      }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

interface GlobeDrawing {
  camera: GlobeCamera;
  width: number;
  height: number;
  dark: boolean;
  landMask: LandMask | null;
  route: RouteSegment[];
}

const pinLabel =
  "pin-label inline-flex items-center gap-1 rounded-full bg-us-surface px-2.5 py-1.25 text-[12.5px] font-black whitespace-nowrap text-us-ink shadow-[0_6px_14px_-8px_rgba(31,43,66,.5)]";

// A to-do pin: a dot (✦ idea, ✓ done, or its stop number) beside its title.
function TodoPin({
  pin,
  mark,
  index,
}: {
  pin: GlobePin;
  mark: NonNullable<GlobePin["mark"]>;
  index: number;
}) {
  return (
    <div
      className={cn(
        "absolute flex animate-pin-dot items-center gap-1.5",
        pin.labelLeft
          ? "flex-row-reverse [transform:translate(calc(-100%+15px),-15px)]"
          : "[transform:translate(-15px,-15px)]",
      )}
      style={{
        left: `${pin.x.toFixed(1)}px`,
        top: `${pin.y.toFixed(1)}px`,
        visibility: pin.visible ? "visible" : "hidden",
        animationDelay: `${0.1 + index * 0.1}s`,
      }}
    >
      <span
        className={cn(
          "pin-dot flex size-7.5 flex-none items-center justify-center rounded-full text-[13px] font-black shadow-[0_6px_12px_-6px_rgba(31,43,66,.6)]",
          mark === "done" && "bg-[#4F70A8] text-white ring-[2.5px] ring-white",
          mark === "idea" &&
            "bg-[#FAEDBE] text-[#8A6A12] ring-[2.5px] ring-white",
          typeof mark === "number" &&
            "bg-white text-[#4F70A8] inset-ring-[2.5px] inset-ring-[#4F70A8]",
        )}
      >
        {typeof mark === "number" ? mark : pinMarks[mark]}
      </span>
      <span className={pinLabel}>{pin.name}</span>
    </div>
  );
}

function GlobeLayer({
  active,
  pins,
  ...drawing
}: GlobeDrawing & { active: boolean; pins: GlobePin[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (active && canvasRef.current) drawGlobe(canvasRef.current, drawing);
  });

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden bg-us-map transition-[opacity,background-color] duration-[600ms,500ms]",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Dot globe showing the places on our notes"
        className="absolute inset-0 block size-full"
      />
      {active ? (
        <>
          {pins.map((pin, index) =>
            pin.mark !== undefined ? (
              <TodoPin
                key={pin.placeId}
                pin={pin}
                mark={pin.mark}
                index={index}
              />
            ) : (
              <div
                key={pin.placeId}
                className="absolute flex animate-pin-drop flex-col items-center gap-1 [transform:translate(-50%,-26px)]"
                style={{
                  left: `${pin.x.toFixed(1)}px`,
                  top: `${pin.y.toFixed(1)}px`,
                  visibility: pin.visible ? "visible" : "hidden",
                  animationDelay: `${0.25 + index * 0.12}s`,
                }}
              >
                <HeartIcon
                  width={30}
                  height={30}
                  className="text-[#4F70A8] [&_path]:stroke-white [&_path]:stroke-[1.6]"
                />
                <span className={pinLabel}>
                  {pin.name}
                  <span className="font-bold text-us-muted">
                    {" "}
                    · {pin.count}
                  </span>
                </span>
              </div>
            ),
          )}
          {earthRadiusMeters / drawing.camera.radius < 60 ? (
            <div className="absolute top-5 left-1/2 flex -translate-x-1/2 animate-fade items-center gap-2 rounded-full border border-us-line bg-us-surface px-3.5 py-2.25 text-[12.5px] font-extrabold whitespace-nowrap text-us-muted shadow-[0_10px_24px_-14px_rgba(31,43,66,.55)]">
              <MapIcon size={15} strokeWidth={2.2} aria-hidden="true" />
              Streets &amp; buildings appear here from the live map
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export { GlobeLayer };
export type { GlobePin, RouteSegment };
