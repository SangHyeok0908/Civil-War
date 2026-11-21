package cw.accounts;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlayerAccountRepository extends JpaRepository<PlayerAccountEntity, String> {
    java.util.List<PlayerAccountEntity> findByRiotIdIgnoreCase(String riotId);

    Optional<PlayerAccountEntity> findByLcuPuuid(String lcuPuuid);

    Optional<PlayerAccountEntity> findByOfficialPuuid(String officialPuuid);
}
