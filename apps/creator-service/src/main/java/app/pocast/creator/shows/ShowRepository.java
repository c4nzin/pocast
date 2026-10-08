package app.pocast.creator.shows;

import app.pocast.creator.common.PublishStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShowRepository extends JpaRepository<Show, UUID> {

	Optional<Show> findByIdAndOwnerId(UUID id, UUID ownerId);

	Optional<Show> findByIdAndStatus(UUID id, PublishStatus status);

	List<Show> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId, Limit limit);

	long countByOwnerId(UUID ownerId);
}
