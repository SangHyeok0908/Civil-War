package cw.auth;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "enrollment_codes")
public class EnrollmentCode {
    @Id public String id;
    public String secretHash;
    public String scope;
    public String memberId;
    public Instant expiresAt;
    public boolean consumed;
    public boolean revoked;
}
