import React from "react";
import { Composition, registerRoot } from "remotion";
import { MatchFilm } from "../MatchFilm";
import { DesignStudy } from "./Film";
import { STUDY_FRAMES, studyProps } from "./model";

const Root = () => (
  <>
    <Composition
      id="DesignStudy"
      component={DesignStudy}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={STUDY_FRAMES}
    />
    <Composition
      id="CurrentStudy"
      component={MatchFilm}
      defaultProps={studyProps}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={STUDY_FRAMES}
    />
  </>
);
registerRoot(Root);
