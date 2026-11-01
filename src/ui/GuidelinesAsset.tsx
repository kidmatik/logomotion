import { useEffect, useState } from "react";
import type { Project } from "../types";
import type { BrandAssets } from "../engine/kit";
import { useAccount } from "../cloud/account";
import { findShare, shareUrl, type ShareRow } from "../cloud/shares";
import { GuidelinesThumb, pageUrl } from "./Onboarding";
import { Icon } from "./icons";

/**
 * The live brand guidelines page as one of the brand's assets: a live preview
 * card with quick ways to edit it, publish or share it, and copy its link.
 */
export function GuidelinesAsset({ project, assets, refreshKey, onEdit, onShare }: { project: Project; assets: BrandAssets; refreshKey: number; onEdit: () => void; onShare: () => void }) {
  const account = useAccount();
  const [share, setShare] = useState<ShareRow | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!account.enabled || !account.user || !account.currentId) return setShare(null);
    let live = true;
    findShare(account.currentId)
      .then((s) => live && setShare(s))
      .catch(() => live && setShare(null));
    return () => {
      live = false;
    };
  }, [account.enabled, account.user, account.currentId, refreshKey]);

  const url = share ? shareUrl(share.id) : "";
  const stale = !!share && JSON.stringify(share.data) !== JSON.stringify(project);
  const status = share === undefined ? "Checking…" : share ? (stale ? "Live · you have changes to publish" : "Live · up to date") : "Not published yet";

  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="gl-asset">
      <button type="button" className="gl-asset-art" onClick={onEdit} aria-label="Edit the brand guidelines page">
        <GuidelinesThumb project={project} assets={assets} url={share ? url.replace(/^https?:\/\//, "") : pageUrl(project.brand)} />
      </button>
      <div className="gl-asset-body">
        <div className="gl-asset-head">
          <strong>Live brand guidelines</strong>
          <span className={"gl-asset-status" + (share ? (stale ? " stale" : " live") : "")}>{status}</span>
        </div>
        <p>Your brand book as one shareable page: logo files, colours, type, voice and the film. Edit it anytime.</p>
        <div className="gl-asset-actions">
          <button type="button" className="ghost-btn small" onClick={onEdit}>
            <Icon.Pen size={13} /> Edit page
          </button>
          <button type="button" className="primary-btn small" onClick={onShare}>
            <Icon.Link size={13} /> {share ? (stale ? "Update & share" : "Share") : "Publish & share"}
          </button>
          {share && (
            <>
              <button type="button" className="link-btn" onClick={copy}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <a className="link-btn" href={url} target="_blank" rel="noreferrer">
                Open
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
