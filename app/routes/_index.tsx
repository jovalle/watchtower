import { useState } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { Form, useNavigation } from '@remix-run/react';
import { Play, Tv, Film, Users, Plus, X } from 'lucide-react';
import { getPlexToken } from '~/lib/auth/session.server';

const FAQ_ITEMS = [
  {
    question: 'What is Watchtower?',
    answer:
      'Watchtower is a private streaming interface for our household media library. It provides a modern, Netflix-style experience for browsing and enjoying movies and TV shows.',
  },
  {
    question: 'What is wrong with Netflix?',
    answer:
      "What's great about Netflix today? Prices keep going up, content quality keeps going down. With Watchtower, you get a curated collection without the ads or subscriptions.",
  },
  {
    question: 'How do I sign in?',
    answer:
      "Sign in using your Plex account. If you need help getting set up with Plex, just ask and we'll get you sorted.",
  },
  {
    question: 'What devices can I watch on?',
    answer:
      'Stream on any device with a web browser — smart TVs, laptops, tablets, and phones. For the best TV experience, use the Plex app on Roku, Apple TV, or Fire TV.',
  },
  {
    question: 'How do I request something to watch?',
    answer:
      "Have a movie or show you'd like to see? Just let us know and we'll look into adding it to the collection.",
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between bg-[#2d2d2d] px-6 py-5 text-left text-lg font-normal text-foreground-primary transition-colors hover:bg-[#3d3d3d] md:text-xl"
      >
        {question}
        {isOpen ? (
          <X className="h-7 w-7 flex-shrink-0 text-foreground-primary" />
        ) : (
          <Plus className="h-7 w-7 flex-shrink-0 text-foreground-primary" />
        )}
      </button>
      <div
        className={`overflow-hidden bg-[#2d2d2d] transition-all duration-300 ${
          isOpen ? 'max-h-96' : 'max-h-0'
        }`}
      >
        <p className="border-t border-background-primary px-6 py-5 text-lg text-foreground-primary md:text-xl">
          {answer}
        </p>
      </div>
    </div>
  );
}

export const meta: MetaFunction = () => {
  return [
    { title: 'Watchtower' },
    { name: 'description', content: 'Your personal streaming experience' },
  ];
};

/**
 * Landing page loader - only checks if user is already logged in.
 * No server content is exposed to unauthenticated users.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userToken = await getPlexToken(request);

  // If logged in, redirect to the authenticated home
  if (userToken) {
    return redirect('/app');
  }

  return null;
}

export default function Index() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Hero Section - Full viewport height with background */}
      <div className="relative flex min-h-screen flex-col">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url("https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop")`,
          }}
        />
        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-background-primary via-background-primary/70 to-background-primary/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-background-primary/80 via-transparent to-background-primary/80" />

        {/* Hero Content */}
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-3xl space-y-6">
            <img
              src="/watchtower-logo.png"
              alt="Watchtower"
              className="mx-auto h-12 md:h-16 lg:h-20"
            />
            <p className="mx-auto max-w-xl text-lg text-foreground-secondary md:text-xl">
              Your very own movie theater. <br />
              Sit back, relax, and enjoy the collection.
            </p>

            {/* CTA Button */}
            <Form method="post" action="/auth/redirect" className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-3 rounded-md bg-accent-primary px-8 py-4 text-lg font-semibold text-accent-foreground origin-center transition-[transform,background-color] duration-200 hover:bg-accent-hover hover:scale-105 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="h-5 w-5 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Connecting...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current" />
                    Start Watching
                  </>
                )}
              </button>
            </Form>
          </div>
        </main>

        {/* Scroll indicator */}
        <div className="relative z-10 flex justify-center pb-8">
          <div className="animate-bounce text-foreground-muted">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="border-t-8 border-background-elevated bg-background-primary py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 md:grid-cols-3">
            {/* Feature 1 */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10">
                <Film className="h-8 w-8 text-accent-primary" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-foreground-primary">Movies & Shows</h3>
              <p className="text-foreground-secondary">
                Browse the growing collection of films and series, all organized and ready to
                stream.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10">
                <Tv className="h-8 w-8 text-accent-primary" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-foreground-primary">Watch Anywhere</h3>
              <p className="text-foreground-secondary">
                Stream on your TV, laptop, phone, or tablet — wherever you feel like watching.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10">
                <Users className="h-8 w-8 text-accent-primary" />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-foreground-primary">For the Family</h3>
              <p className="text-foreground-secondary">
                A private collection curated for friends and family. No ads, no subscriptions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-t-8 border-background-elevated bg-background-primary py-12 md:py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-6 text-center text-2xl font-bold text-foreground-primary md:text-4xl">
            Frequently Asked Questions
          </h2>
          <div>
            {FAQ_ITEMS.map((item, index) => (
              <FAQItem key={index} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t-8 border-background-elevated bg-background-primary py-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="mb-4 text-2xl font-bold text-foreground-primary md:text-3xl">
            Ready to watch?
          </h2>
          <p className="mb-6 text-foreground-secondary">
            Sign in with your Plex account to get started.
          </p>
          <Form method="post" action="/auth/redirect">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-md bg-accent-primary px-6 py-3 font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Sign in with Plex
            </button>
          </Form>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="border-t border-background-elevated bg-background-primary py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-foreground-muted">
          <p>Netflix raised the price. We raised the bar. Powered by Plex.</p>
        </div>
      </footer>
    </div>
  );
}
