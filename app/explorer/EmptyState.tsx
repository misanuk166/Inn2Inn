export function EmptyState() {
  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">No regions loaded yet</h2>
      <p className="text-sm text-zinc-600">
        Inn2Inn needs at least one region&rsquo;s data in Postgres before the Explorer can render anything.
        Run the pipeline to populate Marin (the v1 region):
      </p>
      <pre className="rounded-md bg-zinc-900 px-3 py-2 text-xs text-zinc-100">
        npm run pipeline -- --region=marin
      </pre>
      <p className="text-xs text-zinc-500">
        See <code>pipeline/README.md</code> for prerequisites and full instructions.
      </p>
    </div>
  );
}
