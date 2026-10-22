/// <reference lib="webworker" />
/*
  Grades photographs off the page's main thread (see photoGrade). It is
  handed a print's pixels, works them through the grade, and hands them
  back, so the loading screen and everything else on the page keep
  running while it does.
*/
import { runJob, type PixelDone, type PixelJob } from "./photoPixels";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<PixelJob>) => {
  const data = runJob(e.data);
  const done: PixelDone = { id: e.data.id, data };
  scope.postMessage(done, [data.buffer]);
};
