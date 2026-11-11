import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router }  from '@angular/router';
import { LanguageService } from '../../services/language.service';
import { StorageService, StressCheckPhase, StressResultStorage } from '../../services/storage.service';

interface StressQuestion {
    prompt: string;
    options: string[];
}

interface QuestionnaireCopy {
    eyebrow: string;
    backHome: string;
    kicker: string;
    title: string;
    intro: string;
    afterKicker: string;
    afterTitle: string;
    afterIntro: string;
    next: string;
    seeResult: string;
    back: string;
    resultKicker: string;
    afterResultKicker: string;
    stressLevel: string;
    lowerStress: string;
    someStress: string;
    higherStress: string;
    lowerStressDescription: string;
    someStressDescription: string;
    higherStressDescription: string;
    compareTitle: string;
    beforeLabel: string;
    afterLabel: string;
    compareImproved: (diff: number) => string;
    compareWorse: (diff: number) => string;
    compareSame: string;
    compareMissing: string;
    disclaimer: string;
    restart: string;
    returnHome: string;
    pageNote: string;
    questions: StressQuestion[];
}

@Component({
    selector: 'app-stress-questionnaire',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './stress-questionnaire.component.html',
    styleUrl: './stress-questionnaire.component.scss'
})
export class StressQuestionnaireComponent {
    private readonly languageService = inject(LanguageService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly storage = inject(StorageService);

    /**
     * 'before' is the pre-trail check-in (first visit). 'after' is taken once the trail is
     * completed (?phase=after) so the two stress numbers can be compared side by side.
     */
    readonly phase = signal<StressCheckPhase>('before');
    readonly isAfter = computed(() => this.phase() === 'after');
    readonly beforeResult = signal<StressResultStorage | null>(null);

    constructor() {
        if (this.route.snapshot.queryParamMap.get('phase') === 'after') {
            this.phase.set('after');
            this.beforeResult.set(this.storage.getStressResult('before'));
        }

        // Persist each completed run under its own phase so before/after stay separate.
        effect(() => {
            if (this.isComplete()) {
                this.storage.setStressResult(this.phase(), {
                    score: this.score(),
                    level: this.result().level,
                    completedAt: new Date().toISOString()
                });
                // Completing the post-trail check unlocks the certificate page's Finish button.
                if (this.phase() === 'after') {
                    this.storage.setReadyToFinish(true);
                }
            }
        });
    }

    readonly language = computed(() => this.languageService.currentLanguage().code);
    readonly copy = computed<QuestionnaireCopy>(() => this.language() === 'th' ? {
        eyebrow: 'ช่วงเวลาสำหรับตัวคุณ',
        backHome: 'กลับหน้าหลัก',
        kicker: 'เช็กระดับความเครียด',
        title: 'ช่วงนี้คุณรู้สึกอย่างไรบ้าง?',
        intro: 'ตอบคำถามจากความรู้สึกของคุณในช่วงสัปดาห์ที่ผ่านมา ไม่มีคำตอบที่ถูกหรือผิด',
        afterKicker: 'เช็กระดับความเครียดหลังเดินเส้นทาง',
        afterTitle: 'หลังเดินเส้นทาง คุณรู้สึกอย่างไร?',
        afterIntro: 'ตอบคำถามจากความรู้สึกของคุณในตอนนี้ หลังเดินเส้นทางเสร็จสิ้น เราจะเปรียบเทียบกับผลที่คุณทำไว้ก่อนเริ่มเดิน',
        next: 'คำถามถัดไป',
        seeResult: 'ดูผลลัพธ์',
        back: 'ย้อนกลับ',
        resultKicker: 'ผลการเช็กของคุณ',
        afterResultKicker: 'ผลการเช็กหลังเดินเส้นทาง',
        stressLevel: 'ระดับความเครียด',
        lowerStress: 'ความเครียดอยู่ในระดับต่ำ',
        someStress: 'มีความเครียดบ้าง',
        higherStress: 'ความเครียดอยู่ในระดับสูง',
        lowerStressDescription: 'คำตอบของคุณบ่งบอกว่าความเครียดในสัปดาห์นี้ยังอยู่ในระดับที่จัดการได้ ลองหาเวลาให้กับสิ่งที่ช่วยให้คุณรู้สึกผ่อนคลายและมั่นคงต่อไป',
        someStressDescription: 'คำตอบของคุณบ่งบอกว่าอาจมีความเครียดเกิดขึ้นในช่วงนี้ การหยุดพักสั้น ๆ ใช้เวลาใกล้ชิดธรรมชาติ หรือพูดคุยกับคนที่ไว้ใจอาจช่วยได้',
        higherStressDescription: 'คำตอบของคุณบ่งบอกว่าความเครียดอาจกำลังส่งผลต่อคุณ ลองหาเวลาขอความช่วยเหลือจากคนที่ไว้ใจหรือผู้เชี่ยวชาญที่มีคุณสมบัติเหมาะสม',
        compareTitle: 'เปรียบเทียบก่อนและหลังเดินเส้นทาง',
        beforeLabel: 'ก่อนเดินเส้นทาง',
        afterLabel: 'หลังเดินเส้นทาง',
        compareImproved: (diff: number) => `ระดับความเครียดของคุณลดลง ${diff} ระดับหลังเดินเส้นทาง`,
        compareWorse: (diff: number) => `ระดับความเครียดของคุณเพิ่มขึ้น ${diff} ระดับหลังเดินเส้นทาง`,
        compareSame: 'ระดับความเครียดของคุณเท่าเดิมหลังเดินเส้นทาง',
        compareMissing: 'ไม่พบผลการเช็กก่อนเดินเส้นทาง จึงแสดงเฉพาะผลหลังเดินเส้นทาง',
        disclaimer: 'แบบประเมินสั้น ๆ นี้จัดทำขึ้นเพื่อการทบทวนตนเอง ไม่ใช่การวินิจฉัยทางการแพทย์ หากความเครียดจัดการได้ยากหรือคุณรู้สึกไม่ปลอดภัย โปรดติดต่อผู้เชี่ยวชาญหรือหน่วยฉุกเฉินในพื้นที่',
        restart: 'ทำแบบประเมินอีกครั้ง',
        returnHome: 'กลับหน้าหลัก',
        pageNote: 'การหยุดสำรวจความรู้สึกของตัวเองอาจเป็นจุดเริ่มต้นของการดูแลตัวเอง',
        questions: [
            { prompt: 'ในช่วงสัปดาห์ที่ผ่านมา คุณรู้สึกว่าภาระหน้าที่ท่วมท้นบ่อยแค่ไหน?', options: ['ไม่เคย', 'บางครั้ง', 'บ่อยครั้ง', 'เกือบตลอดเวลา'] },
            { prompt: 'คุณรู้สึกผ่อนคลายหรือหยุดคิดเรื่องต่าง ๆ ได้ยากบ่อยแค่ไหน?', options: ['ไม่เคย', 'บางครั้ง', 'บ่อยครั้ง', 'เกือบตลอดเวลา'] },
            { prompt: 'ความเครียดส่งผลต่อการนอนหลับของคุณบ่อยแค่ไหน?', options: ['ไม่เคย', 'บางครั้ง', 'บ่อยครั้ง', 'เกือบตลอดเวลา'] },
            { prompt: 'คุณรู้สึกตึงกระสับกระส่ายหรืออยู่ไม่สุขบ่อยแค่ไหน?', options: ['ไม่เคย', 'บางครั้ง', 'บ่อยครั้ง', 'เกือบตลอดเวลา'] },
            { prompt: 'ความเครียดทำให้คุณเพลิดเพลินกับสิ่งที่เคยชอบได้ยากขึ้นบ่อยแค่ไหน?', options: ['ไม่เคย', 'บางครั้ง', 'บ่อยครั้ง', 'เกือบตลอดเวลา'] }
        ]
    } : {
        eyebrow: 'A moment for yourself',
        backHome: 'Back to home',
        kicker: 'Stress check-in',
        title: 'How are you feeling lately?',
        intro: 'Answer based on the past week. There are no right or wrong answers.',
        afterKicker: 'Post-trail stress check',
        afterTitle: 'How do you feel after the trail?',
        afterIntro: 'Answer based on how you feel right now, after completing the trail. We will compare it with your check-in from before the walk.',
        next: 'Next question',
        seeResult: 'See my result',
        back: 'Back',
        resultKicker: 'Your check-in',
        afterResultKicker: 'Your post-trail check-in',
        stressLevel: 'Stress level',
        lowerStress: 'Lower stress',
        someStress: 'Some stress',
        higherStress: 'Higher stress',
        lowerStressDescription: 'Your answers suggest that stress has been relatively manageable this week. Keep making space for the things that help you feel grounded.',
        someStressDescription: 'Your answers suggest that stress may be showing up in your week. A short pause, time outdoors, or talking with someone you trust may help.',
        higherStressDescription: 'Your answers suggest that stress may be weighing on you. Consider making time for support from someone you trust or a qualified professional.',
        compareTitle: 'Before vs after the trail',
        beforeLabel: 'Before the trail',
        afterLabel: 'After the trail',
        compareImproved: (diff: number) => `Your stress level went down by ${diff} after the trail.`,
        compareWorse: (diff: number) => `Your stress level went up by ${diff} after the trail.`,
        compareSame: 'Your stress level stayed the same after the trail.',
        compareMissing: 'No pre-trail check-in was found, so only your post-trail result is shown.',
        disclaimer: 'This quick check-in is for reflection, not a medical diagnosis. If stress feels difficult to manage or you feel unsafe, please reach out to a qualified professional or local emergency support.',
        restart: 'Take it again',
        returnHome: 'Return home',
        pageNote: 'A gentle check-in can be the first step toward caring for yourself.',
        questions: [
            { prompt: 'Over the past week, how often have you felt overwhelmed by your responsibilities?', options: ['Never', 'Sometimes', 'Often', 'Almost always'] },
            { prompt: 'How often have you found it difficult to relax or switch off?', options: ['Never', 'Sometimes', 'Often', 'Almost always'] },
            { prompt: 'How often has stress affected your sleep?', options: ['Never', 'Sometimes', 'Often', 'Almost always'] },
            { prompt: 'How often have you felt tense, restless, or on edge?', options: ['Never', 'Sometimes', 'Often', 'Almost always'] },
            { prompt: 'How often has stress made it harder to enjoy things you usually like?', options: ['Never', 'Sometimes', 'Often', 'Almost always'] }
        ]
    });

    readonly questions = computed(() => this.copy().questions);

    readonly activeKicker = computed(() => this.isAfter() ? this.copy().afterKicker : this.copy().kicker);
    readonly activeTitle = computed(() => this.isAfter() ? this.copy().afterTitle : this.copy().title);
    readonly activeIntro = computed(() => this.isAfter() ? this.copy().afterIntro : this.copy().intro);
    readonly activeResultKicker = computed(() => this.isAfter() ? this.copy().afterResultKicker : this.copy().resultKicker);

    readonly currentQuestion = signal(0);
    readonly answers = signal<number[]>([]);
    readonly selectedAnswer = computed(() => this.answers()[this.currentQuestion()] ?? null);
    readonly isComplete = computed(() => this.answers().length === this.questions().length);
    readonly progress = computed(() => ((this.currentQuestion() + 1) / this.questions().length) * 100);
    readonly score = computed(() => this.answers().reduce((total, answer) => total + answer, 0));
    readonly result = computed(() => {
        const score = this.score();
        const level = Math.min(5, Math.max(1, Math.ceil((score + 1) / 3)));
        if (score <= 4) {
            return {
                level,
                label: this.copy().lowerStress,
                description: this.copy().lowerStressDescription
            };
        }
        if (score <= 9) {
            return {
                level,
                label: this.copy().someStress,
                description: this.copy().someStressDescription
            };
        }
        return {
            level,
            label: this.copy().higherStress,
            description: this.copy().higherStressDescription
        };
    });

    /** Side-by-side numbers shown after the post-trail run, when a pre-trail result exists. */
    readonly comparison = computed(() => {
        if (!this.isAfter()) {
            return null;
        }
        const before = this.beforeResult();
        if (!before) {
            return null;
        }
        return {
            beforeLevel: before.level,
            beforeScore: before.score,
            afterLevel: this.result().level,
            afterScore: this.score(),
            levelDiff: this.result().level - before.level
        };
    });

    compareMessage(levelDiff: number): string {
        if (levelDiff < 0) {
            return this.copy().compareImproved(Math.abs(levelDiff));
        }
        if (levelDiff > 0) {
            return this.copy().compareWorse(levelDiff);
        }
        return this.copy().compareSame;
    }

    setLanguage(languageCode: 'en' | 'th'): void {
        this.languageService.setLanguage(languageCode);
    }

    selectAnswer(answer: number): void {
        const updatedAnswers = [...this.answers()];
        updatedAnswers[this.currentQuestion()] = answer;
        this.answers.set(updatedAnswers);
    }

    next(): void {
        if (this.selectedAnswer() === null) {
            return;
        }

        if (this.currentQuestion() < this.questions().length - 1) {
            this.currentQuestion.update(question => question + 1);
            return;
        }

        this.currentQuestion.set(this.questions().length - 1);
    }

    previous(): void {
        if (this.currentQuestion() > 0) {
            this.currentQuestion.update(question => question - 1);
        }
    }

    restart(): void {
        this.answers.set([]);
        this.currentQuestion.set(0);
    }

    /**
     * "Return home" behaves differently after the trail: instead of going home it sends the
     * user to the certificate page and locks the menu there — the same as pressing Continue
     * on the post-trail prompt without doing the questionnaire. The before-trail run still
     * goes home.
     */
    returnHome(): void {
        if (this.isAfter()) {
            this.storage.setReadyToFinish(true);
            this.storage.setCertificateOnlyMode(true);
            void this.router.navigate(['/certificate']);
            return;
        }
        void this.router.navigate(['/home']);
    }
}
