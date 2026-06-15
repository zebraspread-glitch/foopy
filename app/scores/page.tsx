import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";
import { getMatches } from "../lib/data";

export default function ScoresPage() {
  const matches = getMatches();

  return (
    <main>
      <PageHeader title="Live Games" subtitle="Scores and fixtures" />
      <div className="page grid">
        {matches.map((match) => (
          <Link className="card match-card" href={`/match/${match.id}`} key={match.id}>
            <div>
              <span className="pill">{match.status}</span>
              <h2>{match.homeTeam} vs {match.awayTeam}</h2>
              <p className="muted">{match.venue} · {match.startTime}</p>
            </div>
            <div className="score">{match.homeScore} - {match.awayScore}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
