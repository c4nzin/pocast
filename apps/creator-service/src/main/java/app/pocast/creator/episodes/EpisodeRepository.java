package app.pocast.creator.episodes;

import app.pocast.creator.common.PublishStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EpisodeRepository extends JpaRepository<Episode, UUID> {

	@Query("""
			select e from Episode e
			where e.id = :id and e.showId in (select s.id from Show s where s.ownerId = :ownerId)
			""")
	Optional<Episode> findOwned(@Param("id") UUID id, @Param("ownerId") UUID ownerId);

	List<Episode> findByShowIdOrderByCreatedAtDesc(UUID showId, Limit limit);

	List<Episode> findByShowIdAndStatusOrderByPublishedAtDesc(UUID showId, PublishStatus status, Limit limit);

	long countByShowId(UUID showId);
}
