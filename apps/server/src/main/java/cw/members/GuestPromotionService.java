package cw.members;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestPromotionService {
    @PersistenceContext private EntityManager em;

    @Transactional(propagation = Propagation.MANDATORY)
    public int linkHistory(String playerId, String memberId) {
        return em.createNativeQuery(
                        "update match_participants set member_id=:member where player_id=:player and member_id is distinct from :member")
                .setParameter("member", memberId)
                .setParameter("player", playerId)
                .executeUpdate();
    }
}
