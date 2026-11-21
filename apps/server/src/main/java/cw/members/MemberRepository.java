package cw.members;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<MemberEntity, String> {
    java.util.List<MemberEntity> findByRiotIdIgnoreCase(String riotId);

    Optional<MemberEntity> findByAccountId(String accountId);

    Optional<MemberEntity> findByPuuid(String puuid);
}
