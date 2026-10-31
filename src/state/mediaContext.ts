import { createContext, useContext } from "react";
import type { MediaEl } from "../engine/kit";

/** Loaded media elements by id, for thumbnails anywhere in the editor. */
export const MediaContext = createContext<Map<string, MediaEl>>(new Map());
export const useMediaEls = () => useContext(MediaContext);
