package cw.auth;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "collector_credentials")
public class CollectorCredential {
    @Id public String id;
    public String secretHash;
    public String memberId;
    public Instant createdAt;
    public boolean revoked;
}
