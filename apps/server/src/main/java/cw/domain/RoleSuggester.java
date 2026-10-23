package cw.domain;

import cw.contracts.Role;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

public class RoleSuggester {
    public record Sample(String source, String gameId, Instant playedAt, Role role) {}

    public record Suggestion(
            Role primary,
            Role secondary,
            int sampleCount,
            Map<String, Long> sources,
            String reason) {}

    public Suggestion suggest(List<Sample> input) {
        LinkedHashMap<String, Sample> unique = new LinkedHashMap<String, Sample>();
        input.stream()
                .filter(
                        s ->
                                s.role() != null
                                        && s.playedAt() != null
                                        && Set.of("solo420", "inhouse").contains(s.source()))
                .sorted(
                        Comparator.comparing(Sample::playedAt)
                                .reversed()
                                .thenComparing(Sample::source)
                                .thenComparing(Sample::gameId))
                .forEach(s -> unique.putIfAbsent(s.source() + ":" + s.gameId(), s));

        List<Sample> samples = unique.values().stream().limit(20).toList();

        Map<Role, Long> count = new EnumMap<>(Role.class);
        Map<Role, Instant> recent = new EnumMap<>(Role.class);
        Map<String, Long> sources = new TreeMap<>();

        for (Sample s : samples) {
            count.merge(s.role(), 1L, Long::sum);
            recent.merge(s.role(), s.playedAt(), (a, b) -> a.isAfter(b) ? a : b);
            sources.merge(s.source(), 1L, Long::sum);
        }

        List<Role> roles =
                count.keySet().stream()
                        .sorted(
                                Comparator.<Role>comparingLong(count::get)
                                        .reversed()
                                        .thenComparing(
                                                Comparator.<Role, Instant>comparing(recent::get)
                                                        .reversed())
                                        .thenComparingInt(Enum::ordinal))
                        .toList();

        return new Suggestion(
                roles.isEmpty() ? null : roles.getFirst(),
                roles.size() < 2 ? null : roles.get(1),
                samples.size(),
                Map.copyOf(sources),
                samples.isEmpty()
                        ? "확인된 포지션 표본이 없습니다."
                        : "최근 최대 20경기의 포지션 빈도 순입니다. 동률은 최근 플레이와 고정 역할 순으로 결정하며, 적용은 운영자가 확인합니다.");
    }
}
