-- Reference data only. No demo people, admin account, paid privilege or live room.
insert into private.runtime_settings(singleton,billing_environment,admissions_enabled) values(true,'test',false) on conflict do nothing;
insert into public.themes(slug,label) values
  ('music','Goûts musicaux'),('astrology','Astrologie'),('nearby','Près de chez vous'),
  ('culture','Culture et sorties'),('sport','Sport'),('travel','Voyages'),('profession','Univers professionnel')
on conflict do nothing;
