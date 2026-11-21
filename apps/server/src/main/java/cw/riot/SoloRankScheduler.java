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
    private final SoloRankService ranks;
    private final MemberProfileService profiles;

    public SoloRankScheduler(SoloRankService ranks, MemberProfileService profiles) {
        this.ranks = ranks;
        this.profiles = profiles;
    }

    @Scheduled(fixedDelayString = "${cw.riot.poll-ms:1000}")
    public void tick() {
        ranks.refreshNextDue();
        profiles.refreshNextDue();
    }
}
