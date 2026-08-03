import { defineEventHandler } from "h3";

import { dispatchEvent } from "@/server/http/dispatcher";

export default defineEventHandler(async (event) => dispatchEvent(event));
