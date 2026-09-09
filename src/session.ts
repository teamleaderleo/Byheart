import type { OwnershipState, Surface } from "./types.js";

const ALLOWED: Record<OwnershipState, OwnershipState[]> = {
  automation_owned: ["paused_for_review", "completed", "failed"],
  paused_for_review: ["human_owned", "automation_owned", "failed"],
  human_owned: ["returning_to_automation", "completed", "failed"],
  returning_to_automation: ["automation_owned", "failed"],
  completed: [],
  failed: [],
};

export class OwnershipController {
  private current: OwnershipState = "automation_owned";

  constructor(private readonly surface: Surface) {}

  state(): OwnershipState {
    return this.current;
  }

  async pauseForReview(): Promise<void> {
    await this.transition("paused_for_review");
    await this.surface.pause?.();
  }

  async giveToHuman(): Promise<void> {
    await this.transition("human_owned");
  }

  async requestReturn(): Promise<void> {
    await this.transition("returning_to_automation");
  }

  async resumeAutomation(): Promise<void> {
    await this.transition("automation_owned");
    await this.surface.resume?.();
  }

  async complete(): Promise<void> {
    await this.transition("completed");
  }

  async fail(): Promise<void> {
    await this.transition("failed");
  }

  private async transition(next: OwnershipState): Promise<void> {
    if (!ALLOWED[this.current].includes(next)) {
      throw new Error(`invalid ownership transition: ${this.current} -> ${next}`);
    }
    this.current = next;
  }
}
