package cw.matches;

import cw.contracts.Role;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;

public final class MatchSpecifications {
    private MatchSpecifications() {}

    public record Filters(String memberId, Integer championId, Role role, Boolean win) {}

    public record Cursor(Instant startedAt, String key) {}

    public static Specification<MatchEntity> registered(Filters filters, Cursor cursor) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("state"), "registered"));

            if (cursor != null) {
                predicates.add(
                        cb.or(
                                cb.lessThan(root.get("startedAt"), cursor.startedAt()),
                                cb.and(
                                        cb.equal(root.get("startedAt"), cursor.startedAt()),
                                        cb.lessThan(root.get("id"), cursor.key()))));
            }

            if (filters.memberId() != null
                    || filters.championId() != null
                    || filters.role() != null
                    || filters.win() != null) {
                // One correlated participant row must satisfy every filter. EXISTS never multiplies
                // match rows.
                Subquery<Integer> sub = query.subquery(Integer.class);
                Root<MatchParticipantEntity> p = sub.from(MatchParticipantEntity.class);

                List<Predicate> where = new ArrayList<>();
                where.add(cb.equal(p.get("match").get("id"), root.get("id")));

                if (filters.memberId() != null) {
                    where.add(cb.equal(p.get("memberId"), filters.memberId()));
                }

                if (filters.championId() != null) {
                    where.add(cb.equal(p.get("championId"), filters.championId()));
                }

                if (filters.role() != null) {
                    where.add(cb.equal(p.get("role"), filters.role()));
                }

                if (filters.win() != null) {
                    where.add(cb.equal(p.get("win"), filters.win()));
                }

                sub.select(cb.literal(1)).where(where.toArray(Predicate[]::new));
                predicates.add(cb.exists(sub));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
