import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel narrow" style={{ margin: "40px auto" }}>
      <h1>Not here</h1>
      <p>That page doesn't exist, or it belongs to someone else.</p>
      <Link className="btn" href="/">Go to today's reading</Link>
    </div>
  );
}
