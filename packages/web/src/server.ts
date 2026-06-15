import { serve } from "@hono/node-server";
<<<<<<< HEAD
import app from "./index";
=======
import app from "./api/index";
>>>>>>> claude/confident-babbage-HM6av

const port = 3000;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
