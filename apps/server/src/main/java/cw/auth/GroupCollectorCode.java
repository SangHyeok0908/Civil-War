package cw.auth;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "group_collector_code")
public class GroupCollectorCode {
    @Id public int id;
    public String secretHash;
    public long generation;
    public Instant issuedAt;
}
