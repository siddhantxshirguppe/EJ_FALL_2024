If you're trying to match Chicago police data by police district with the racial and ethnic makeup of those police districts, this post might help you.

The boundaries for police districts and precincts don't usually line up nicely with US census boundaries like census tracts or block group. That makes it tough to compare incident and arrest data reported by precinct with the population makeup of those precincts. 

But in bigger cities, census blocks are small enough to serve as atomic units that usually do fall within police precinct boundaries. So by knowing which blocks are within which districts, you can calculate the populations. Unfortunately, block-level data is only available from the decennial, so the latest data is from 2010. But it still should serve as a good measure — and a reason to fill out your 2020 census form online!

I did those calculations for New York City, and here's Chicago's by request!

In this zip file are three files:

- chicago_2010pop_by_2020policedistricts.csv is the 2010 US Census data on race and ethnicity (just Hispanic or non-Hispanic, alas), summed by Chicago police district —as those districts are drawn today (though it looks like the official map was updated last in 2018). The columns are a little cryptic, but follow the Census bureau's coding: 

    P003001 - Total population
    P003002 - White alone
    P003003 - Black or African American alone
    P003004 - American Indian and Alaska Native alone
    P003005 - Asian alone
    P003006 - Native Hawaiian and Other Pacific Islander alone
    P003007 - Some Other Race alone
    P003008 - Two or More Races
    P005001 - Total population (again)
    P005002 - Not Hispanic or Latino
    P005003 - Not Hispanic or Latino: White alone
    P005004 - Not Hispanic or Latino: Black or African American alone
    P005005 - Not Hispanic or Latino: American Indian and Alaska Native alone
    P005006 - Not Hispanic or Latino: Asian alone
    P005007 - Not Hispanic or Latino: Native Hawaiian and Other Pacific Islander alone
    P005008 - Not Hispanic or Latino: Some Other Race alone
    P005009 - Not Hispanic or Latino: Two or More Races
    P005010 - Hispanic or Latino
    P005011 - Hispanic or Latino: White alone
    P005012 - Hispanic or Latino: Black or African American alone
    P005013 - Hispanic or Latino: American Indian and Alaska Native alone
    P005014 - Hispanic or Latino: Asian alone
    P005015 - Hispanic or Latino: Native Hawaiian and Other Pacific Islander alone
    P005016 - Hispanic or Latino: Some Other Race alone
    P005017 - Hispanic or Latino: Two or More Races

- chicago_2010blocks_2020policedistricts_population.csv lists every block that's in a Chicago police district along with the district number and the data above ☝️ for each block. Note that this includes a few blocks near O'Hare airport that fall in DuPage county. The population by district file above is a pivot of this file.

- chicago_2010blocks_2020policedistricts_key.csv is the "Rosetta Stone" of the project, which marries block numbers (as "GEOID10") with police districts. I did this using the QGIS open-source mapping software, doing some batch processing and then inspecting each district individually.

## Caveats

I'm pretty confident in the process here, but did this rather quickly on a Sunday and don't have a backup editor, so there may be errors!  Also, while Chicago police districts almost always follow streets — as do census blocks — there were a couple of imperfect matches:

Block 170318104003050: The northern half of this block falls in the 31st district, while the southern half falls in the 16th. A check of Google Maps shows the southern half to be almost entirely commercial, so I left it in the 31st district.

Block 17043840000204: This block in DuPage County is adjacent to O'Hare airport, and the southern. portion hangs outside of the 16th district (and not into any other district). But the overhang is almost entirely a rail yard, so I left it in the 16th district.

## Let me know

Tweet at me at @jkeefe if this helps you ... and especially if you find anything amiss. Also hist me up if you'd like this for data work you're doing in your city.

-- John Keefe, New York City, June 2020

johnkeefe.net
