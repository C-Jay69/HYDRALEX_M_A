
import app from "../src/index.js";

export const fetch = (request) => {
  return app.fetch(request);
};

export default async function handler(request) {
  return app.fetch(request);
}
