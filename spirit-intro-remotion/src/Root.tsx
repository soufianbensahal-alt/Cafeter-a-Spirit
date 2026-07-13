import "./index.css";
import {Composition} from "remotion";
import {SpiritIntro} from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SpiritIntro"
      component={SpiritIntro}
      durationInFrames={210}
      fps={60}
      width={1080}
      height={1920}
      defaultProps={{}}
    />
  );
};
