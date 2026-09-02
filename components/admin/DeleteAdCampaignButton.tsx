"use client";

export function DeleteAdCampaignButton({ campaignName, live }: { campaignName: string; live: boolean }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        const warning = live
          ? `Delete "${campaignName}"? It's currently running — this permanently removes the campaign, its creative, and all impression/click history. This cannot be undone.`
          : `Delete "${campaignName}"? This permanently removes the campaign, its creative, and all impression/click history. This cannot be undone.`;
        if (!window.confirm(warning)) e.preventDefault();
      }}
      className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
    >
      Delete campaign
    </button>
  );
}
