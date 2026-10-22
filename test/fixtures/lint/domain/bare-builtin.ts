import { readFile } from "fs";

export const leak = [readFile, process.env];
