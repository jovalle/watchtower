import { ArrowUp } from "lucide-react";
import { Button } from "~/components/ui/Button";

interface AlphabetSidebarProps {
  activeLetter?: string;
  availableLetters?: string[];
  onLetterClick?: (letter: string) => void;
  onReturnToTop?: () => void;
}

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function AlphabetSidebar({ activeLetter, availableLetters = ALPHABET, onLetterClick, onReturnToTop }: AlphabetSidebarProps) {
  return (
    <nav aria-label="Alphabet Navigation" className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
      <Button variant="ghost" size="sm" className="h-11 w-11 !px-0 bg-background-elevated" aria-label="Return to Top"
        onClick={() => onReturnToTop ? onReturnToTop() : window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </Button>
      <select aria-label="Jump to Letter" value={activeLetter ?? ""} disabled={!availableLetters.length}
        onChange={(event) => onLetterClick?.(event.target.value)}
        className="h-11 w-11 rounded-md border border-border-emphasis bg-background-elevated text-center text-sm text-foreground-primary disabled:opacity-50">
        <option value="" disabled>A–Z</option>
        {ALPHABET.map((letter) => <option key={letter} value={letter} disabled={!availableLetters.includes(letter)}>{letter}</option>)}
      </select>
    </nav>
  );
}
