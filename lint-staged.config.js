// Runs the whole affected project's oxlint check (not just the staged files) whenever any file
// under backend/ or frontend/ is staged -- oxlint is fast enough that this stays quick, and it
// avoids the path-rewriting complexity of mapping staged file paths into each project's own cwd.
module.exports = {
  "backend/**/*.{ts,tsx}": () => "npm --prefix backend run lint",
  "frontend/**/*.{ts,tsx}": () => "npm --prefix frontend run lint",
};
