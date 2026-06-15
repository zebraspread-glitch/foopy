"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";
import {
  SettingsHeader, SettingsScreen, Body, Group, ControlRow, Toggle, ColourPicker,
  AFL_TEAMS, TEAM_LOGO, TEAM_COLOR, savePref,
} from "../shared";

export default function MyTeamSettings() {
  const [userId, setUserId] = useState<string | null>(null);
  const [favTeam, setFavTeam] = useState("");
  const [teamFeaturedMatch, setTeamFeaturedMatch] = useState(true);
  const [teamBorderColor, setTeamBorderColor] = useState("#c9962a");
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  useEffect(() => {
    setFavTeam(localStorage.getItem("foopy_fav_team") ?? "");
    setTeamFeaturedMatch(localStorage.getItem("foopy_team_featured") !== "false");
    setTeamBorderColor(localStorage.getItem("foopy_team_border_color") ?? "#c9962a");

    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      supabase.from("profiles").select("favourite_team").eq("id", user.id).single().then(({ data }) => {
        const dbTeam = data?.favourite_team ?? "";
        const localTeam = localStorage.getItem("foopy_fav_team") ?? "";
        const resolved = dbTeam || localTeam;
        setFavTeam(resolved);
        if (resolved) localStorage.setItem("foopy_fav_team", resolved);
      });
    });
  }, []);

  const favTeamColor = favTeam ? (TEAM_COLOR[favTeam] ?? "#3b82f6") : "#3b82f6";

  return (
    <SettingsScreen>
      <SettingsHeader title="My Team" backHref="/settings" />
      <Body>
        <Group>
          <ControlRow
            icon={favTeam && TEAM_LOGO[favTeam]
              ? <img src={TEAM_LOGO[favTeam]} alt="" style={{ width: 21, height: 21, objectFit: "contain" }} />
              : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            label="Favourite Team"
            sub={favTeam || "Not selected — Required"}
          >
            <div onClick={() => setShowTeamPicker(true)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              {favTeam && <div style={{ width: 8, height: 8, borderRadius: "50%", background: favTeamColor }} />}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </ControlRow>

          <ControlRow
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>}
            label="Featured Match Box"
            sub="Gold outline on your team's game"
          >
            <Toggle on={teamFeaturedMatch} onToggle={() => { const n = !teamFeaturedMatch; setTeamFeaturedMatch(n); savePref("foopy_team_featured", String(n)); }} />
          </ControlRow>

          {teamFeaturedMatch && (
            <ControlRow
              icon={<div style={{ width: 19, height: 19, borderRadius: "50%", background: teamBorderColor, border: "2px solid rgba(255,255,255,0.15)" }} />}
              label="Border Colour"
              sub="Match card highlight colour"
            >
              <ColourPicker
                value={teamBorderColor}
                swatches={["#c9962a", "#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#ffffff"]}
                onChange={(c) => { setTeamBorderColor(c); savePref("foopy_team_border_color", c); }}
              />
            </ControlRow>
          )}
        </Group>
      </Body>

      {showTeamPicker && (
        <>
          <div onClick={() => setShowTeamPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 101,
            width: "min(340px, 88vw)", maxHeight: "78dvh", background: "var(--surface-1)",
            border: "1px solid var(--border-2)", borderRadius: 20, overflow: "hidden",
            display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px 13px", borderBottom: "1px solid var(--border-1)", flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Choose Your Team</span>
              <button onClick={() => setShowTeamPicker(false)} style={{ background: "var(--surface-3)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {AFL_TEAMS.map(t => {
                const active = favTeam === t;
                const tc = TEAM_COLOR[t];
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setFavTeam(t);
                      savePref("foopy_fav_team", t);
                      setShowTeamPicker(false);
                      if (userId) supabase.from("profiles").update({ favourite_team: t }).eq("id", userId).then(() => {});
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 18px",
                      background: active ? `${tc}15` : "none", border: "none", borderBottom: "1px solid var(--border-1)",
                      color: active ? "var(--text-1)" : "var(--text-2)", fontSize: 14, fontWeight: active ? 700 : 400, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: `${tc}18`, border: `1px solid ${tc}33` }}>
                      {TEAM_LOGO[t] && <img src={TEAM_LOGO[t]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    {t}
                    {active && <svg style={{ marginLeft: "auto" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </SettingsScreen>
  );
}
