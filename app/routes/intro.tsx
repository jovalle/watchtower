import type { MetaFunction } from "@remix-run/node";
import { useEffect } from "react";
import { useNavigate } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "Watchtower" },
    { name: "description", content: "Welcome to Watchtower" },
  ];
};

export default function Intro() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/app");
    }, 4500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <>
      <style>{styles}</style>
      <div id="container">
        <div className="netflixintro" data-letter="W">
          {/* Left vertical bar */}
          <div className="helper-1">
            <div className="effect-brush">
              {[...Array(31)].map((_, i) => <span key={i} className={`fur-${i + 1}`} />)}
            </div>
            <div className="effect-lumieres">
              {[...Array(28)].map((_, i) => <span key={i} className={`lamp-${i + 1}`} />)}
            </div>
          </div>
          {/* Diagonal */}
          <div className="helper-2">
            <div className="effect-brush">
              {[...Array(31)].map((_, i) => <span key={i} className={`fur-${i + 1}`} />)}
            </div>
          </div>
          {/* Right vertical bar */}
          <div className="helper-3">
            <div className="effect-brush">
              {[...Array(31)].map((_, i) => <span key={i} className={`fur-${i + 1}`} />)}
            </div>
          </div>
          {/* Shadow/depth element */}
          <div className="helper-4">
            <div className="effect-brush">
              {[...Array(31)].map((_, i) => <span key={i} className={`fur-${i + 1}`} />)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background-color: #000;
  overflow: hidden;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
}

.netflixintro {
  position: relative;
  width: 142px;
  height: 300px;
  overflow: hidden;
  animation: zoom-in 3.5s ease-in 0.5s forwards;
}

/* Netflix N Letter Structure */
.helper-1 {
  position: absolute;
  width: 36px;
  height: 295px;
  left: 0;
  top: 3px;
  overflow: hidden;
}

.helper-2 {
  position: absolute;
  width: 142px;
  height: 295px;
  left: 0;
  top: 3px;
  transform: skewX(-22deg);
  transform-origin: top left;
  overflow: hidden;
}

.helper-3 {
  position: absolute;
  width: 36px;
  height: 295px;
  right: 0;
  top: 3px;
  overflow: hidden;
}

.helper-4 {
  position: absolute;
  width: 36px;
  height: 102px;
  right: 0;
  top: 196px;
  background: linear-gradient(to bottom, rgba(253, 190, 2, 0.8), rgba(253, 190, 2, 0));
  overflow: hidden;
  animation: fading-out 0.5s ease-in 1.5s forwards;
}

/* Brush Effect */
.effect-brush {
  position: absolute;
  display: flex;
  width: 100%;
  height: 200%;
  top: 0;
  animation: brush-moving 2s ease-in-out forwards;
}

.helper-1 .effect-brush { animation-delay: 0s; }
.helper-2 .effect-brush { animation-delay: 0.4s; }
.helper-3 .effect-brush { animation-delay: 0s; }
.helper-4 .effect-brush { animation-delay: 0s; }

/* Fur Base */
[class*="fur-"] {
  position: absolute;
  height: 100%;
}

/* Fur variations - Watchtower gold (#FDBE02) */
.fur-1 { width: 6%; left: 0%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }
.fur-2 { width: 2%; left: 5.5%; background: linear-gradient(to bottom, transparent 0%, transparent 20%, #FDBE02 24%, #FDBE02 76%, transparent 80%, transparent 100%); }
.fur-3 { width: 4%; left: 7%; background: linear-gradient(to bottom, transparent 0%, transparent 28%, #FDBE02 32%, #FDBE02 68%, transparent 72%, transparent 100%); }
.fur-4 { width: 1%; left: 10.5%; background: linear-gradient(to bottom, transparent 0%, transparent 22%, #FDBE02 26%, #FDBE02 74%, transparent 78%, transparent 100%); }
.fur-5 { width: 5%; left: 11%; background: linear-gradient(to bottom, transparent 0%, transparent 30%, #FDBE02 34%, #FDBE02 66%, transparent 70%, transparent 100%); }
.fur-6 { width: 2%; left: 15.5%; background: linear-gradient(to bottom, transparent 0%, transparent 24%, #FDBE02 28%, #FDBE02 72%, transparent 76%, transparent 100%); }
.fur-7 { width: 4%; left: 17%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }
.fur-8 { width: 1%; left: 20.5%; background: linear-gradient(to bottom, transparent 0%, transparent 20%, #FDBE02 24%, #FDBE02 76%, transparent 80%, transparent 100%); }
.fur-9 { width: 6%; left: 21%; background: linear-gradient(to bottom, transparent 0%, transparent 28%, #FDBE02 32%, #FDBE02 68%, transparent 72%, transparent 100%); }
.fur-10 { width: 2%; left: 26.5%; background: linear-gradient(to bottom, transparent 0%, transparent 22%, #FDBE02 26%, #FDBE02 74%, transparent 78%, transparent 100%); }
.fur-11 { width: 5%; left: 28%; background: linear-gradient(to bottom, transparent 0%, transparent 30%, #FDBE02 34%, #FDBE02 66%, transparent 70%, transparent 100%); }
.fur-12 { width: 1%; left: 32.5%; background: linear-gradient(to bottom, transparent 0%, transparent 24%, #FDBE02 28%, #FDBE02 72%, transparent 76%, transparent 100%); }
.fur-13 { width: 4%; left: 33%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }
.fur-14 { width: 2%; left: 36.5%; background: linear-gradient(to bottom, transparent 0%, transparent 20%, #FDBE02 24%, #FDBE02 76%, transparent 80%, transparent 100%); }
.fur-15 { width: 6%; left: 38%; background: linear-gradient(to bottom, transparent 0%, transparent 28%, #FDBE02 32%, #FDBE02 68%, transparent 72%, transparent 100%); }
.fur-16 { width: 1%; left: 43.5%; background: linear-gradient(to bottom, transparent 0%, transparent 22%, #FDBE02 26%, #FDBE02 74%, transparent 78%, transparent 100%); }
.fur-17 { width: 5%; left: 44%; background: linear-gradient(to bottom, transparent 0%, transparent 30%, #FDBE02 34%, #FDBE02 66%, transparent 70%, transparent 100%); }
.fur-18 { width: 2%; left: 48.5%; background: linear-gradient(to bottom, transparent 0%, transparent 24%, #FDBE02 28%, #FDBE02 72%, transparent 76%, transparent 100%); }
.fur-19 { width: 4%; left: 50%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }
.fur-20 { width: 1%; left: 53.5%; background: linear-gradient(to bottom, transparent 0%, transparent 20%, #FDBE02 24%, #FDBE02 76%, transparent 80%, transparent 100%); }
.fur-21 { width: 6%; left: 54%; background: linear-gradient(to bottom, transparent 0%, transparent 28%, #FDBE02 32%, #FDBE02 68%, transparent 72%, transparent 100%); }
.fur-22 { width: 2%; left: 59.5%; background: linear-gradient(to bottom, transparent 0%, transparent 22%, #FDBE02 26%, #FDBE02 74%, transparent 78%, transparent 100%); }
.fur-23 { width: 5%; left: 61%; background: linear-gradient(to bottom, transparent 0%, transparent 30%, #FDBE02 34%, #FDBE02 66%, transparent 70%, transparent 100%); }
.fur-24 { width: 1%; left: 65.5%; background: linear-gradient(to bottom, transparent 0%, transparent 24%, #FDBE02 28%, #FDBE02 72%, transparent 76%, transparent 100%); }
.fur-25 { width: 4%; left: 66%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }
.fur-26 { width: 2%; left: 69.5%; background: linear-gradient(to bottom, transparent 0%, transparent 20%, #FDBE02 24%, #FDBE02 76%, transparent 80%, transparent 100%); }
.fur-27 { width: 6%; left: 71%; background: linear-gradient(to bottom, transparent 0%, transparent 28%, #FDBE02 32%, #FDBE02 68%, transparent 72%, transparent 100%); }
.fur-28 { width: 1%; left: 76.5%; background: linear-gradient(to bottom, transparent 0%, transparent 22%, #FDBE02 26%, #FDBE02 74%, transparent 78%, transparent 100%); }
.fur-29 { width: 5%; left: 77%; background: linear-gradient(to bottom, transparent 0%, transparent 30%, #FDBE02 34%, #FDBE02 66%, transparent 70%, transparent 100%); }
.fur-30 { width: 2%; left: 81.5%; background: linear-gradient(to bottom, transparent 0%, transparent 24%, #FDBE02 28%, #FDBE02 72%, transparent 76%, transparent 100%); }
.fur-31 { width: 4%; left: 83%; background: linear-gradient(to bottom, transparent 0%, transparent 26%, #FDBE02 30%, #FDBE02 70%, transparent 74%, transparent 100%); }

/* Lights Effect */
.effect-lumieres {
  position: absolute;
  width: 300%;
  height: 100%;
  top: 0;
  left: -100%;
  opacity: 0;
  animation: showing-lumieres 0.25s ease-in 1.6s forwards;
}

.effect-lumieres span {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
}

/* Lamp colors - Netflix-style rainbow with Watchtower gold accent */
.lamp-1 { background: #ff0100; box-shadow: 0 0 10px 3px #ff0100; top: 5%; left: 45%; animation: lumieres-moving-left 5s ease-in 1.6s forwards; }
.lamp-2 { background: #fffb00; box-shadow: 0 0 10px 3px #fffb00; top: 10%; left: 52%; animation: lumieres-moving-right 5.5s ease-in 1.6s forwards; }
.lamp-3 { background: #00fff2; box-shadow: 0 0 10px 3px #00fff2; top: 15%; left: 48%; animation: lumieres-moving-left 5.2s ease-in 1.6s forwards; }
.lamp-4 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 20%; left: 55%; animation: lumieres-moving-right 5.3s ease-in 1.6s forwards; }
.lamp-5 { background: #ff00e1; box-shadow: 0 0 10px 3px #ff00e1; top: 25%; left: 42%; animation: lumieres-moving-left 5.1s ease-in 1.6s forwards; }
.lamp-6 { background: #00ff15; box-shadow: 0 0 10px 3px #00ff15; top: 30%; left: 58%; animation: lumieres-moving-right 5.4s ease-in 1.6s forwards; }
.lamp-7 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 35%; left: 46%; animation: lumieres-moving-left 5s ease-in 1.6s forwards; }
.lamp-8 { background: #ff00ff; box-shadow: 0 0 10px 3px #ff00ff; top: 40%; left: 53%; animation: lumieres-moving-right 5.5s ease-in 1.6s forwards; }
.lamp-9 { background: #00ffff; box-shadow: 0 0 10px 3px #00ffff; top: 45%; left: 47%; animation: lumieres-moving-left 5.2s ease-in 1.6s forwards; }
.lamp-10 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 50%; left: 56%; animation: lumieres-moving-right 5.3s ease-in 1.6s forwards; }
.lamp-11 { background: #ffff00; box-shadow: 0 0 10px 3px #ffff00; top: 55%; left: 44%; animation: lumieres-moving-left 5.1s ease-in 1.6s forwards; }
.lamp-12 { background: #ff3d00; box-shadow: 0 0 10px 3px #ff3d00; top: 60%; left: 54%; animation: lumieres-moving-right 5.4s ease-in 1.6s forwards; }
.lamp-13 { background: #00ffa5; box-shadow: 0 0 10px 3px #00ffa5; top: 65%; left: 49%; animation: lumieres-moving-left 5s ease-in 1.6s forwards; }
.lamp-14 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 70%; left: 51%; animation: lumieres-moving-right 5.5s ease-in 1.6s forwards; }
.lamp-15 { background: #ff0055; box-shadow: 0 0 10px 3px #ff0055; top: 75%; left: 43%; animation: lumieres-moving-left 5.2s ease-in 1.6s forwards; }
.lamp-16 { background: #00b3ff; box-shadow: 0 0 10px 3px #00b3ff; top: 80%; left: 57%; animation: lumieres-moving-right 5.3s ease-in 1.6s forwards; }
.lamp-17 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 85%; left: 50%; animation: lumieres-moving-left 5.1s ease-in 1.6s forwards; }
.lamp-18 { background: #9dff00; box-shadow: 0 0 10px 3px #9dff00; top: 90%; left: 52%; animation: lumieres-moving-right 5.4s ease-in 1.6s forwards; }
.lamp-19 { background: #ff6a00; box-shadow: 0 0 10px 3px #ff6a00; top: 8%; left: 50%; animation: lumieres-moving-left 5s ease-in 1.6s forwards; }
.lamp-20 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 18%; left: 48%; animation: lumieres-moving-right 5.5s ease-in 1.6s forwards; }
.lamp-21 { background: #00ffcc; box-shadow: 0 0 10px 3px #00ffcc; top: 28%; left: 51%; animation: lumieres-moving-left 5.2s ease-in 1.6s forwards; }
.lamp-22 { background: #ff00bf; box-shadow: 0 0 10px 3px #ff00bf; top: 38%; left: 49%; animation: lumieres-moving-right 5.3s ease-in 1.6s forwards; }
.lamp-23 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 48%; left: 52%; animation: lumieres-moving-left 5.1s ease-in 1.6s forwards; }
.lamp-24 { background: #ccff00; box-shadow: 0 0 10px 3px #ccff00; top: 58%; left: 47%; animation: lumieres-moving-right 5.4s ease-in 1.6s forwards; }
.lamp-25 { background: #ff0033; box-shadow: 0 0 10px 3px #ff0033; top: 68%; left: 53%; animation: lumieres-moving-left 5s ease-in 1.6s forwards; }
.lamp-26 { background: #FDBE02; box-shadow: 0 0 10px 3px #FDBE02; top: 78%; left: 46%; animation: lumieres-moving-right 5.5s ease-in 1.6s forwards; }
.lamp-27 { background: #00e0ff; box-shadow: 0 0 10px 3px #00e0ff; top: 88%; left: 54%; animation: lumieres-moving-left 5.2s ease-in 1.6s forwards; }
.lamp-28 { background: #ff9500; box-shadow: 0 0 10px 3px #ff9500; top: 95%; left: 48%; animation: lumieres-moving-right 5.3s ease-in 1.6s forwards; }

/* Animations */
@keyframes brush-moving {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}

@keyframes zoom-in {
  0% { transform: scale(1); }
  100% { transform: scale(15); }
}

@keyframes fading-out {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes showing-lumieres {
  0% { opacity: 0; }
  100% { opacity: 1; }
}

@keyframes lumieres-moving-left {
  0% { transform: translate(0); }
  40% { transform: translate(10px) scaleX(1); }
  50% { transform: translate(60px); }
  100% { transform: translate(120px) scaleX(3); }
}

@keyframes lumieres-moving-right {
  0% { transform: translate(0); }
  40% { transform: translate(-10px) scaleX(1); }
  50% { transform: translate(-60px); }
  100% { transform: translate(-120px) scaleX(3); }
}
`;
