export interface FrameSequence { name: string; frames: number[]; priority: number; loop?: boolean; }
export class SequencePlayer {
    private current: FrameSequence | undefined;

    play(sequence: FrameSequence): boolean {
        if (this.current && sequence.priority < this.current.priority) {return false;}
        if (this.current && sequence.priority === this.current.priority && this.current !== sequence) {return false;}
        this.current = sequence;
        return true;
    }

    interrupt(sequence: FrameSequence): boolean { return this.play(sequence); }
    getCurrent(): FrameSequence | undefined { return this.current; }
    stop(): void { this.current = undefined; }
    finish(): number[] { this.current = undefined; return [1]; }
}
