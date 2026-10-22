import { z } from "zod";
import { createApp } from "./../../../../src/server/app";

export const leak = [z, createApp];
