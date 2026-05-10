import Link from "next/link";
import { getMatches } from "../lib/data";

export default function ScoresPage() {
  const matches = getMatches();
  return <main className="page grid">
    <h1>Live Games</h1>
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
  </main>;
}
