/** Beat boundaries in frames (30 fps). */
export const B = {
  hook: 0, // page is slow, number counts up
  zoomOut: 100, // phone moves up, architecture appears
  pressure: 160, // the same query floods the database
  same: 250, // "same question, same answer"
  cache: 330, // a cache appears
  firstReq: 400, // miss → database → save a copy
  hits: 560, // every request after: hit
  payoff: 650, // 900 ms → 40 ms
  tease: 760, // cliffhanger
  end: 900,
}

export const HERO = { width: 1080, height: 1920, fps: 30, durationInFrames: B.end }
