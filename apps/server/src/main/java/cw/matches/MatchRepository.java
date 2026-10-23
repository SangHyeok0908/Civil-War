package cw.matches;

import java.util.List;
import org.springframework.data.jpa.repository.*;

public interface MatchRepository
        extends JpaRepository<MatchEntity, String>, JpaSpecificationExecutor<MatchEntity> {
    List<MatchEntity> findByStateOrderByStartedAtDescIdDesc(String state);
}
