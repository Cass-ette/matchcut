import React from "react";
import { Composition, registerRoot } from "remotion";
import { MatchFilm } from "./MatchFilm";
import {
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  totalFrames,
  VideoProps,
  settingsSchema,
} from "../domain";
import preview from "../../data/fixtures/preview.json";
const Root = () => (
  <Composition
    id="MatchFilm"
    component={MatchFilm}
    defaultProps={{
      ...(preview as unknown as VideoProps),
      settings: settingsSchema.parse(
        (preview as unknown as VideoProps).settings,
      ),
    }}
    width={VIDEO_WIDTH}
    height={VIDEO_HEIGHT}
    fps={FPS}
    durationInFrames={1800}
    calculateMetadata={({ props }: { props: VideoProps }) => ({
      durationInFrames: totalFrames(props.segments),
    })}
  />
);
registerRoot(Root);
