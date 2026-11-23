(function () {
  'use strict';

  function formatDateFR(iso) {
    if (!iso) return '';
    var d = new Date(iso.slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  // 1. Mobile navigation drawer
  var menuToggle = document.getElementById('menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function () {
      var expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
      mobileMenu.hidden = expanded;
    });

    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menuToggle.setAttribute('aria-expanded', 'false');
        mobileMenu.hidden = true;
      });
    });
  }

  // 2. Filières interactive filter tabs
  var tabButtons = document.querySelectorAll('.tab-btn[data-track]');
  var trackCards = document.querySelectorAll('[data-track-card]');
  var tracksGrid = document.getElementById('tracks-grid');

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var selected = btn.getAttribute('data-track');

      tabButtons.forEach(function (b) {
        var isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', String(isActive));
      });

      if (tracksGrid) {
        tracksGrid.classList.toggle('single', selected !== 'toutes');
      }

      trackCards.forEach(function (card) {
        var cardTrack = card.getAttribute('data-track-card');
        card.hidden = selected !== 'toutes' && cardTrack !== selected;
      });
    });
  });

  // 3. Hydrate public showcase from Express API when available (falls back cleanly to static content)
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  fetch('../api/public/showcase')
    .then(function (res) {
      if (!res.ok) throw new Error('offline');
      return res.json();
    })
    .then(function (data) {
      if (data.settings) {
        var s = data.settings;
        if (s.nom_etablissement) {
          var brand = document.getElementById('school-brand');
          var footerBrand = document.getElementById('footer-brand');
          if (brand) brand.textContent = s.nom_etablissement;
          if (footerBrand) footerBrand.textContent = s.nom_etablissement;
        }
        if (s.devise) {
          var motto = document.getElementById('school-motto');
          if (motto) motto.textContent = s.devise;
        }
        if (s.message_accueil) {
          var wb = document.getElementById('welcome-banner');
          if (wb) wb.textContent = s.message_accueil;
        }
        if (s.adresse) {
          var addr = document.getElementById('contact-address');
          if (addr) addr.textContent = s.adresse;
        }
        if (s.telephone) {
          var ph = document.getElementById('contact-phone');
          if (ph) ph.textContent = s.telephone;
        }
        if (s.email) {
          var em = document.getElementById('contact-email');
          if (em) em.textContent = s.email;
        }
      }

      if (data.activeYear && data.activeYear.libelle) {
        var hk = document.getElementById('hero-kicker');
        var cy = document.getElementById('caption-year');
        if (hk) hk.textContent = 'Établissement Secondaire Général · Année scolaire ' + data.activeYear.libelle;
        if (cy) cy.textContent = data.activeYear.libelle;
      }

      if (data.stats) {
        var kc = document.getElementById('kpi-classes');
        var ks = document.getElementById('kpi-subjects');
        if (kc && data.stats.classesCount) kc.textContent = data.stats.classesCount + ' séries';
        if (ks && data.stats.subjectsCount) ks.textContent = data.stats.subjectsCount + ' disciplines';
      }

      if (Array.isArray(data.announcements) && data.announcements.length > 0) {
        var annList = document.getElementById('announcements-list');
        if (annList) {
          annList.innerHTML = data.announcements
            .map(function (a) {
              return (
                '<article class="feed-item">' +
                '<p class="mono tabular feed-date">' +
                escapeHtml(formatDateFR(a.created_at)) +
                ' · Direction</p>' +
                '<h4>' +
                escapeHtml(a.titre) +
                '</h4>' +
                '<p>' +
                escapeHtml(a.contenu) +
                '</p>' +
                '</article>'
              );
            })
            .join('');
        }
      }

      if (Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
        var calList = document.getElementById('calendar-list');
        if (calList) {
          calList.innerHTML = data.calendarEvents
            .map(function (ev) {
              var dateSpan = formatDateFR(ev.date_debut);
              if (ev.date_fin && ev.date_fin !== ev.date_debut) {
                dateSpan += ' — ' + formatDateFR(ev.date_fin);
              }
              return (
                '<div class="event-row">' +
                '<div>' +
                '<h4>' +
                escapeHtml(ev.titre) +
                '</h4>' +
                (ev.description ? '<p>' + escapeHtml(ev.description) + '</p>' : '') +
                '</div>' +
                '<span class="mono tabular event-date">' +
                escapeHtml(dateSpan) +
                '</span>' +
                '</div>'
              );
            })
            .join('');
        }
      }
    })
    .catch(function () {
      // Static fallback content already rendered in HTML
    });

  // 4. Public contact / inquiry form handler
  var contactForm = document.getElementById('contact-form');
  var contactFeedback = document.getElementById('contact-feedback');
  var contactSubmit = document.getElementById('contact-submit');

  if (contactForm && contactFeedback && contactSubmit) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var formData = new FormData(contactForm);
      var payload = {
        nom: String(formData.get('nom') || '').trim(),
        contact: String(formData.get('contact') || '').trim(),
        profil: String(formData.get('profil') || 'parent'),
        message: String(formData.get('message') || '').trim(),
      };

      contactFeedback.hidden = true;
      contactSubmit.disabled = true;
      contactSubmit.textContent = 'Transmission...';

      fetch('../api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (j) {
              throw new Error(j.error || 'Erreur lors de la transmission.');
            });
          }
          return res.json();
        })
        .then(function (data) {
          contactFeedback.className = 'form-feedback ok';
          contactFeedback.textContent = data.message || 'Votre demande a bien été transmise.';
          contactFeedback.hidden = false;
          contactForm.reset();
        })
        .catch(function (err) {
          // If hosted statically without Express backend, still confirm cleanly without crash
          if (location.hostname.indexOf('github.io') !== -1 || err.message === 'Failed to fetch') {
            contactFeedback.className = 'form-feedback ok';
            contactFeedback.textContent =
              'Votre message a été préparé. Pour un enregistrement direct au secrétariat, contactez-nous par téléphone ou via l’espace portail.';
            contactFeedback.hidden = false;
            contactForm.reset();
          } else {
            contactFeedback.className = 'form-feedback err';
            contactFeedback.textContent = err.message;
            contactFeedback.hidden = false;
          }
        })
        .finally(function () {
          contactSubmit.disabled = false;
          contactSubmit.textContent = 'Envoyer la demande au secrétariat';
        });
    });
  }
})();
