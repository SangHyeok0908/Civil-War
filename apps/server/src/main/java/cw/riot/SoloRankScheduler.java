package cw.riot;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication(
        type = ConditionalOnWebApplication.Type.SERVLET)
@org.springframework.scheduling.annotation.EnableScheduling
@ConditionalOnProperty(name = "cw.riot.poll-enabled", havingValue = "true", matchIfMissing = true)
public class SoloRankScheduler {
    private final MemberProfileService profiles;

    /** Solo ranks are looked up when a team recommendation is requested, not on this timer. */
    public SoloRankScheduler(MemberProfileService profiles) {
        this.profiles = profiles;
    }

    @Scheduled(fixedDelayString = "${cw.riot.poll-ms:1000}")
    public void tick() {
        profiles.refreshNextDue();
    }
}
