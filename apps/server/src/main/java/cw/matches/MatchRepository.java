package cw.matches;
import org.springframework.data.jpa.repository.*;
import java.util.List;
public interface MatchRepository extends JpaRepository<MatchEntity,String>, JpaSpecificationExecutor<MatchEntity> {
    List<MatchEntity> findByStateOrderByStartedAtDescIdDesc(String state);
}
