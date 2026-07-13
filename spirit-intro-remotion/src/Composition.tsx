import React from "react";
import {loadFont} from "@remotion/google-fonts/DMSerifDisplay";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";

const {fontFamily} = loadFont("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const photos = ["cookies.png", "brunch.png", "coffee.png"];

const PawLogo: React.FC = () => (
  <svg viewBox="0 0 240 240" fill="none" aria-label="Spirit Coffee">
    <path d="M66 109c21 0 31-17 26-36S70 39 53 44 31 70 40 87c6 13 15 22 26 22Z" fill="currentColor"/>
    <path d="M174 109c-21 0-31-17-26-36s22-34 39-29 22 26 13 43c-6 13-15 22-26 22Z" fill="currentColor"/>
    <path d="M101 87c15-1 23-17 19-36S104 19 90 24 72 48 79 65c6 13 14 23 22 22Z" fill="currentColor"/>
    <path d="M139 87c-15-1-23-17-19-36s16-32 30-27 18 24 11 41c-6 13-14 23-22 22Z" fill="currentColor"/>
    <path d="M120 111c-41 0-72 36-67 68 4 28 33 38 67 28 34 10 63 0 67-28 5-32-26-68-67-68Z" fill="currentColor"/>
    <path d="M52 51c16 8 24 24 21 45" stroke="#F4CD4A" strokeWidth="7" strokeLinecap="round" opacity=".9"/>
    <path d="M188 51c-16 8-24 24-21 45" stroke="#F4CD4A" strokeWidth="7" strokeLinecap="round" opacity=".9"/>
    <path d="M91 29c11 12 14 28 8 45" stroke="#F4CD4A" strokeWidth="7" strokeLinecap="round" opacity=".9"/>
    <path d="M149 29c-11 12-14 28-8 45" stroke="#F4CD4A" strokeWidth="7" strokeLinecap="round" opacity=".9"/>
  </svg>
);

const PhotoLayer: React.FC<{name: string; index: number}> = ({name, index}) => {
  const frame = useCurrentFrame();
  const starts = [103, 132, 161];
  const start = starts[index];
  const end = index === 2 ? 210 : starts[index + 1] + 10;
  const opacity = interpolate(
    frame,
    [start, start + 14, end - 10, end],
    [0, 1, 1, index === 2 ? 1 : 0],
    {...clamp, easing: Easing.bezier(0.45, 0, 0.55, 1)},
  );

  return (
    <AbsoluteFill style={{opacity}}>
      <Img
        src={staticFile(`assets/${name}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          scale: interpolate(frame, [start, 210], [1.09, 1.02], clamp),
          filter: "saturate(.72) contrast(1.06) brightness(.72)",
        }}
      />
    </AbsoluteFill>
  );
};

const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      {Array.from({length: 62}, (_, i) => {
        const angle = random(`angle-${i}`) * Math.PI * 2;
        const distance = 340 + random(`distance-${i}`) * 690;
        const initialX = Math.cos(angle) * distance;
        const initialY = Math.sin(angle) * distance * 1.4;
        const start = 4 + Math.floor(random(`start-${i}`) * 40);
        const finish = 76 + Math.floor(random(`finish-${i}`) * 24);
        const progress = interpolate(frame, [start, finish], [0, 1], {
          ...clamp,
          easing: Easing.in(Easing.cubic),
        });
        const orbit = Math.sin((frame + i * 9) * 0.055) * (1 - progress) * 32;
        const size = 3 + random(`size-${i}`) * 8;
        const particleOpacity = interpolate(
          frame,
          [start, start + 12, finish - 8, finish + 8],
          [0, 0.85, 1, 0],
          clamp,
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "47%",
              width: size,
              height: size,
              borderRadius: "50%",
              background: i % 5 === 0 ? "#fff6c7" : "#F4CD4A",
              boxShadow: `0 0 ${size * 3}px ${size}px rgba(244,205,74,.38)`,
              opacity: particleOpacity,
              translate: `${initialX * (1 - progress) + orbit}px ${initialY * (1 - progress)}px`,
              scale: interpolate(progress, [0, 0.82, 1], [0.35, 1, 0.15]),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const SpiritIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const photoReveal = interpolate(frame, [100, 172], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const flashOpacity = interpolate(frame, [84, 94, 108], [0, 1, 0], clamp);
  const brandEnter = interpolate(frame, [91, 121], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const titleEnter = interpolate(frame, [110, 145], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const breathing = frame < 132 ? 1 : 1 + Math.sin((frame - 132) / 16) * 0.012;

  return (
    <AbsoluteFill style={{backgroundColor: "#090806", overflow: "hidden"}}>
      <AbsoluteFill
        style={{
          backgroundColor: "#F4CD4A",
          opacity: interpolate(frame, [92, 178], [0, 0.82], clamp),
        }}
      />

      {photos.map((name, index) => <PhotoLayer key={name} name={name} index={index}/>)}

      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(10,8,3,${0.58 - photoReveal * 0.08}) 0%, rgba(87,67,5,.24) 45%, rgba(10,8,3,.68) 100%), rgba(244,205,74,${photoReveal * 0.38})`,
          boxShadow: "inset 0 0 240px 90px rgba(9,8,6,.52)",
        }}
      />

      <Particles/>

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "47%",
          width: interpolate(frame, [82, 103], [40, 780], clamp),
          height: interpolate(frame, [82, 103], [40, 780], clamp),
          translate: "-50% -50%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,248,204,.98) 0%, rgba(244,205,74,.68) 24%, rgba(244,205,74,0) 70%)",
          opacity: flashOpacity,
          filter: "blur(8px)",
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "120px 86px 150px",
          color: "#fffdf5",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 48,
            textAlign: "center",
            opacity: brandEnter,
            translate: `0 ${interpolate(brandEnter, [0, 1], [28, 0])}px`,
          }}
        >
          <div
            style={{
              width: 286,
              height: 286,
              filter: "drop-shadow(0 8px 28px rgba(0,0,0,.32)) drop-shadow(0 0 28px rgba(244,205,74,.25))",
              scale: interpolate(brandEnter, [0, 1], [0.76, breathing]),
            }}
          >
            <PawLogo/>
          </div>

          <div
            style={{
              maxWidth: 890,
              opacity: titleEnter,
              translate: `0 ${interpolate(titleEnter, [0, 1], [32, 0])}px`,
              textShadow: "0 3px 22px rgba(0,0,0,.72)",
            }}
          >
            <div style={{fontFamily, fontSize: 84, lineHeight: 1.02, letterSpacing: "-1.5px"}}>
              Cafetería Spirit |
            </div>
            <div style={{width: 88, height: 3, background: "#F4CD4A", margin: "28px auto"}}/>
            <div style={{fontFamily, fontSize: 47, lineHeight: 1.16, letterSpacing: ".2px"}}>
              Brunch and Specialty Coffee Montcada.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
