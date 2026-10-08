import React from "react";
import { Composition, registerRoot } from "remotion";
import { MatchFilm } from "./MatchFilm";
import { FPS, totalFrames, VideoProps } from "../domain";
import preview from "../../data/fixtures/preview.json";
const Root = () => (
  <Composition
    id="MatchFilm"
    component={MatchFilm}
    defaultProps={preview as VideoProps}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={1800}
    calculateMetadata={({ props }: { props: VideoProps }) => ({
      durationInFrames: totalFrames(props.segments),
    })}
  />
);
registerRoot(Root);
