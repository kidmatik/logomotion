import { createContext, useContext } from "react";
import type { BrandAssets, MediaEl } from "../engine/kit";

/** Loaded media elements by id, for thumbnails anywhere in the editor. */
export const MediaContext = createContext<Map<string, MediaEl>>(new Map());
export const useMediaEls = () => useContext(MediaContext);

/** The drawable brand assets plus a counter that bumps when any of them finish loading, for live thumbnails. */
export const AssetsContext = createContext<{ assets: BrandAssets; version: number } | null>(null);
export const useBrandAssets = () => useContext(AssetsContext);
