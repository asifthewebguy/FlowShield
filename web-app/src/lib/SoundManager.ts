export class SoundManager {
    private audioContext: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private isPlaying: boolean = false;
    private currentVolume: number = 0.5;

    constructor() {
        if (typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass();
            }
        }
    }

    private createNoiseBuffer(type: 'white' | 'pink' | 'brown'): AudioBuffer | null {
        if (!this.audioContext) return null;

        const bufferSize = 2 * this.audioContext.sampleRate; // 2 seconds buffer
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);

        if (type === 'white') {
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        } else if (type === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11; // Validate amplitude
                b6 = white * 0.115926;
            }
        } else if (type === 'brown') {
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5; // Compensate for gain loss
            }
        }

        return buffer;
    }

    async play(type: 'white' | 'pink' | 'brown') {
        if (!this.audioContext) return;

        // Resume context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.stop(); // Stop any current sound

        const buffer = this.createNoiseBuffer(type);
        if (!buffer) return;

        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = buffer;
        this.sourceNode.loop = true;

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.currentVolume;

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.sourceNode.start();
        this.isPlaying = true;
    }

    stop() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
            this.sourceNode = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        this.isPlaying = false;
    }

    setVolume(value: number) {
        this.currentVolume = Math.max(0, Math.min(1, value));
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext?.currentTime || 0);
        }
    }

    getIsPlaying() {
        return this.isPlaying;
    }
}

// Singleton instance
export const soundManager = new SoundManager();
