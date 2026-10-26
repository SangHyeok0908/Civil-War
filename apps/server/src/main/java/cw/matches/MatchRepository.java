package cw.matches;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface MatchRepository
        extends JpaRepository<MatchEntity, String>, JpaSpecificationExecutor<MatchEntity> {
    List<MatchEntity> findByStateOrderByStartedAtDescIdDesc(String state);
}
