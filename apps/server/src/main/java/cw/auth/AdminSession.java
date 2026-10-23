package cw.auth;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "admin_sessions")
public class AdminSession {
    @Id public String id;
    public String secretHash;
    public String csrfHash;
    public Instant createdAt;
    public Instant lastSeenAt;
    public boolean revoked;
}
