package cw.accounts;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "player_accounts")
public class PlayerAccountEntity {
    @Id public String id;
    public String lcuPuuid;
    public String officialPuuid;
    public String riotId;
    public String linkStatus;
    public Instant updatedAt;
}
