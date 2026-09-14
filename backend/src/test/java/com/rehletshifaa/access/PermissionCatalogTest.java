package com.rehletshifaa.access;

import com.rehletshifaa.access.application.PermissionCatalog;
import com.rehletshifaa.access.domain.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;

class PermissionCatalogTest {
    PermissionCatalog catalog=new PermissionCatalog();
    @Test void registeredMetadataAndFutureExecutionBoundary() {
        assertThat(catalog.all()).hasSizeGreaterThan(65);
        assertThat(catalog.all()).allSatisfy(p->{assertThat(p.name()).isNotBlank();assertThat(p.scopes()).isNotEmpty();assertThat(p.actors()).isNotEmpty();});
        assertThat(catalog.all().stream().filter(PermissionDefinition::executable)).allMatch(p->Set.of("access","provider","credential","availability","service_catalog","price_list","assignment").contains(p.family()));
        assertThat(catalog.require("provider.view").executable()).isTrue();
        assertThat(catalog.require("provider.activate").executable()).isTrue();
        assertThat(catalog.require("provider.activate").recentAuthentication()).isTrue();
        assertThat(catalog.require("credential.verify").executable()).isTrue();
        assertThat(catalog.require("credential.verify").recentAuthentication()).isTrue();
        assertThatThrownBy(()->catalog.require("custom.god_mode")).hasMessageContaining("registered");
    }
    @Test void validatesDependenciesAndClinicalActorEnvelope() {
        var grant=new RolePermissionGrant("clinical.recommendation.submit",ScopeType.ASSIGNED_CASES,null);
        var result=catalog.validate(List.of(grant),ActorType.CLINICAL_SUPPORT,ChannelEntitlement.STAFF_WEB);
        assertThat(result.valid()).isFalse();
        assertThat(result.errors()).anyMatch(e->e.startsWith("DEPENDENCY_REQUIRED")).anyMatch(e->e.startsWith("ACTOR_NOT_SUPPORTED"));
    }
    @Test void prohibitsSupportExportAndMakerCheckerCombination() {
        assertThat(catalog.validate(List.of(new RolePermissionGrant("support.account.view",ScopeType.ORGANIZATION,null),
                new RolePermissionGrant("clinical.export",ScopeType.ORGANIZATION,null)),ActorType.GOVERNANCE,ChannelEntitlement.ADMIN_WEB).valid()).isFalse();
        assertThat(catalog.validate(List.of(new RolePermissionGrant("journey.edit_draft",ScopeType.ORGANIZATION,null),
                new RolePermissionGrant("journey.publish",ScopeType.ORGANIZATION,null)),ActorType.GOVERNANCE,ChannelEntitlement.ADMIN_WEB).errors())
                .contains("MAKER_CHECKER_SEPARATION_REQUIRED");
    }
}
