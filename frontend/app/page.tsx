// frontend/app/page.tsx

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-64px)] bg-background">
      <div className="container-app py-10">
        <div className="card p-8 md:p-10 overflow-hidden relative">
          {/* subtle gradient accent */}
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] blur-2xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--ring)_18%,transparent)] blur-2xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 badge mb-4">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Modern UI + system theme
            </div>

            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Rukmer GPT
            </h1>
            <p className="mt-3 text-muted max-w-2xl">
              Upload and Store Large Image or Video files, run analysis jobs, and ask questions grounded
              in the generated reports.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a href="/analysis" className="btn btn-primary">
                Start New Analysis
              </a>
              <a href="/library" className="btn btn-outline">
                Open Media Library
              </a>
              <a href="/job" className="btn btn-ghost">
                View Jobs
              </a>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card-soft p-5">
                <div className="text-sm font-semibold">Upload</div>
                <div className="text-sm text-muted mt-1">
                  Presigned URLs → cloud storage.
                </div>
              </div>
              <div className="card-soft p-5">
                <div className="text-sm font-semibold">Process</div>
                <div className="text-sm text-muted mt-1">
                  Jobs run in the backend and produce structured outputs.
                </div>
              </div>
              <div className="card-soft p-5">
                <div className="text-sm font-semibold">Ask</div>
                <div className="text-sm text-muted mt-1">
                  Query reports via /ai/prompt.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
